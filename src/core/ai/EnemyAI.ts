import { AI, ARMY, BUILDINGS, LEADERS, STREAM, TICK_MS, type BuildingType, type LeaderId, type LeaderPreset } from '../../config/balance';
import { towerRate } from '../sim/combat';
import { buildCost, sendAmount, validate, type Command, type SendMode } from '../sim/commands';
import { nodeCapacity, troopRate } from '../sim/economy';
import { armyPath, routeLength } from '../sim/pathfinding';
import { towerKillsEstimate, towerZoneSec } from '../sim/preview';
import { pendingTo } from '../sim/stream';
import { routeTarget, unitTarget } from '../sim/units';
import { defenseMult, isAttacked, isRival, random, type NodeState, type Owner, type Side, type World } from '../sim/World';
import type { EnemyParams } from '../level/schema';
import type { Goal } from '../sim/victory';

/** Behaviour knobs of a leader; a leaderless AI uses these neutral values. */
const NO_LEADER: Omit<LeaderPreset, 'aggression' | 'thinkMs'> = {
  build: 'normal',
  buildReserve: 0,
  opponentMarginExtra: 0,
  retaliateMs: 0,
  attackAfterMs: 0,
  weakenedBonus: 0,
};

/** AI params from level data: the leader preset, overridden by the level's own aggression and think interval. */
export function aiParamsFromLevel(enemy: EnemyParams, goal?: Goal, playerCapital?: string | null): AiParams {
  const preset = enemy.leader ? LEADERS[enemy.leader] : null;
  // Goals give the enemy something to go for: deny the node to hold, take the player's capital.
  const goalTargets = goal?.type === 'hold' ? [goal.nodeId] : goal?.type === 'capital' && playerCapital ? [playerCapital] : [];
  return {
    thinkMs: enemy.aiThinkMs ?? preset?.thinkMs ?? 1500,
    aggression: enemy.aggression ?? preset?.aggression ?? 0.5,
    startDelayMs: enemy.aiStartDelayMs ?? 0,
    ...(enemy.leader ? { leader: enemy.leader } : {}),
    ...(goalTargets.length ? { goalTargets } : {}),
  };
}

function styleOf(params: AiParams): Omit<LeaderPreset, 'aggression' | 'thinkMs'> {
  return params.leader ? LEADERS[params.leader] : NO_LEADER;
}

export interface AiParams {
  /** Time between decisions, ms. */
  thinkMs: number;
  /** 0 = cautious, 1 = reckless. */
  aggression: number;
  /** No decisions before this time, ms (tutorial levels). */
  startDelayMs?: number;
  /** Character preset (build style, attack rules); none = the default behaviour. */
  leader?: LeaderId;
  /** Nodes the level goal makes important (worth AI.goalTargetValue more). */
  goalTargets?: string[];
}

/** Serializable AI state; the AI itself is the pure function `aiStep`. */
export interface AiState {
  side: Side;
  params: AiParams;
  nextThinkTick: number;
  /** Troops per node, sampled once a second, newest last (for "recently weakened"). */
  snapshots: Array<Record<string, number>>;
  /** Last tick a hostile army was heading to one of our nodes (for counter-attacks). */
  lastAttackedTick: number;
}

export function createAi(side: Side, params: AiParams): AiState {
  // First decision after one think interval (or the start delay), so the player gets a moment at the start.
  const firstMs = Math.max(params.thinkMs, params.startDelayMs ?? 0);
  return {
    side,
    params: { ...params },
    nextThinkTick: Math.max(1, Math.round(firstMs / TICK_MS)),
    snapshots: [],
    lastAttackedTick: -Infinity,
  };
}

const SNAPSHOT_TICKS = Math.round(1000 / TICK_MS);

/**
 * How many troops the node lost compared to its maximum over the snapshots; counts only a drop of at least
 * AI.weakenedShare of that maximum and AI.weakenedMinDrop troops, else 0.
 */
export function recentDrop(snapshots: ReadonlyArray<Record<string, number>>, nodeId: string, troops: number): number {
  let max = troops;
  for (const s of snapshots) max = Math.max(max, s[nodeId] ?? 0);
  const drop = max - troops;
  return drop >= AI.weakenedMinDrop && drop >= max * AI.weakenedShare ? drop : 0;
}

const OWNERS: readonly Owner[] = ['player', 'enemy', 'enemy2', 'neutral'];

/** Hostile units on the field heading to `nodeId` (incoming counters, no unit scan). */
function hostileIncoming(world: World, side: Side, nodeId: string): number {
  const incoming = world.incoming[nodeId]!;
  let n = 0;
  for (const owner of OWNERS) if (owner !== side) n += incoming[owner];
  return n;
}

function observe(world: World, ai: AiState): void {
  for (const node of Object.values(world.nodes)) {
    if (node.owner === ai.side && hostileIncoming(world, ai.side, node.id) > 0) {
      ai.lastAttackedTick = world.tick;
      break;
    }
  }
  if (world.tick % SNAPSHOT_TICKS !== 0) return;
  const snap: Record<string, number> = {};
  for (const n of Object.values(world.nodes)) snap[n.id] = n.troops;
  ai.snapshots.push(snap);
  if (ai.snapshots.length > AI.weakenedWindowSec) ai.snapshots.shift();
}

/**
 * Called every tick before `step`. Returns commands on decision ticks, otherwise [].
 * Plays by the same rules as the player: every command goes through `validate`.
 */
export function aiStep(world: World, ai: AiState): Command[] {
  if (world.winner) return [];
  observe(world, ai);
  if (world.tick < ai.nextThinkTick) return [];
  const jitter = 1 + (random(world) * 2 - 1) * AI.thinkJitter;
  ai.nextThinkTick = world.tick + Math.max(1, Math.round((ai.params.thinkMs * jitter) / TICK_MS));
  return think(world, ai);
}

/** Army route lengths for this AI's side (own nodes only as stops), cached per decision. */
class Distances {
  private readonly cache = new Map<string, number | null>();
  constructor(
    private readonly world: World,
    private readonly side: Side,
  ) {}

  get(from: string, to: string): number | null {
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    if (!this.cache.has(key)) {
      const path = armyPath(this.world, this.side, from, to);
      this.cache.set(key, path ? routeLength(this.world, path) : null);
    }
    return this.cache.get(key)!;
  }
}

/** Mutable view of what this decision has already committed, so later steps don't double-spend troops. */
interface Plan {
  commands: Command[];
  /** Troops already ordered out of a node in this decision. */
  sent: Map<string, number>;
  gold: number;
}

function think(world: World, ai: AiState): Command[] {
  const side = ai.side;
  const dist = new Distances(world, side);
  const plan: Plan = { commands: [], sent: new Map(), gold: world.sides[side].gold };

  evadeDragon(world, side, dist, plan);
  const threatened = defend(world, side, dist, plan);
  spendGold(world, side, ai.params.aggression, styleOf(ai.params), threatened, plan);
  if (world.tick * TICK_MS >= styleOf(ai.params).attackAfterMs) attack(world, ai, threatened, dist, plan);
  consolidate(world, side, threatened, dist, plan);

  // Same rules as the player: drop anything the simulation would reject.
  return plan.commands.filter((cmd) => validate(world, cmd) === null);
}

function own(world: World, side: Side): NodeState[] {
  return Object.values(world.nodes).filter((n) => n.owner === side);
}

/**
 * Troops a node can still send in this decision (one send per node per decision).
 * Attacks and defense are swipes (75%) like the player's; pushing troops to the front is the AI-only
 * `pull` mode (50%), so the rear is never emptied. A node still releasing a stream or under attack sends nothing
 * (a new swipe would cancel the stream; an attacked node can't send, GDD 3.6).
 */
function available(world: World, node: NodeState, plan: Plan, mode: SendMode = 'swipe'): number {
  if (plan.sent.has(node.id) || node.streams > 0 || isAttacked(world, node)) return 0;
  return sendAmount(node.troops, mode);
}

function send(world: World, plan: Plan, side: Side, from: NodeState, to: string, mode: SendMode = 'swipe'): number {
  const count = available(world, from, plan, mode);
  if (count <= 0 || from.id === to) return 0;
  plan.sent.set(from.id, count);
  plan.commands.push({ type: 'send', side, from: from.id, to, mode });
  return count;
}

function etaSec(distance: number): number {
  return distance / ARMY.speed;
}

/** Units of a stream of `count` that reach a node `distance` away within `withinSec` (the first leaves at once). */
function unitsInTime(count: number, distance: number, withinSec: number): number {
  const spare = withinSec - etaSec(distance);
  if (spare < 0) return 0;
  return Math.min(count, 1 + Math.floor(spare * STREAM.releasePerSec * STREAM.width));
}


// ---- Dragon -------------------------------------------------------------------------------------

/** The dragon or the mage has marked one of our nodes: move most troops to the nearest own node (if there is one). */
function evadeDragon(world: World, side: Side, dist: Distances, plan: Plan): void {
  const boss = world.boss;
  if ((boss?.type !== 'dragon' && boss?.type !== 'mage') || !boss.targetId) return;
  const marked = world.nodes[boss.targetId]!;
  if (marked.owner !== side) return;
  const refuge = own(world, side)
    .filter((n) => n.id !== marked.id)
    .map((n) => ({ n, d: dist.get(marked.id, n.id) }))
    .filter((r): r is { n: NodeState; d: number } => r.d !== null)
    .sort((a, b) => a.d - b.d)[0];
  if (refuge) send(world, plan, side, marked, refuge.n.id);
}

// ---- Defense ------------------------------------------------------------------------------------

/** Hostile units heading to one of our nodes within the lookahead. */
interface Threat {
  units: number;
  soonestSec: number;
}

/**
 * One pass over the field per decision: hostile units (and hostile streams still leaving) heading to `side`'s nodes
 * that arrive within AI.defendLookaheadSec.
 */
function threats(world: World, side: Side): Map<string, Threat> {
  const out = new Map<string, Threat>();
  const add = (nodeId: string, units: number, eta: number): void => {
    if (eta > AI.defendLookaheadSec || world.nodes[nodeId]!.owner !== side) return;
    const t = out.get(nodeId);
    if (t) {
      t.units += units;
      t.soonestSec = Math.min(t.soonestSec, eta);
    } else {
      out.set(nodeId, { units, soonestSec: eta });
    }
  };
  // Walking distance to the target: the rest of this road, then the visible part of every next road.
  const walk = (lanes: readonly number[], from: number, progress: number): number => {
    let d = 0;
    for (let i = from; i < lanes.length; i++) {
      const lane = world.lanes[lanes[i]!]!;
      d += (lane.endP - (i === from ? progress : lane.startP)) * lane.length;
    }
    return d;
  };
  for (const unit of world.units) {
    if (unit.owner === side) continue;
    add(unitTarget(unit), 1, etaSec(walk(unit.route.lanes, 0, unit.progress)));
  }
  for (const stream of world.streams) {
    if (stream.owner === side) continue;
    const first = world.lanes[stream.route.lanes[0]!]!;
    add(routeTarget(stream.route), stream.left, etaSec(walk(stream.route.lanes, 0, first.startP)));
  }
  return out;
}

/** How much an own node is worth keeping: its size, plus its building (a lost building goes to the enemy intact). */
function keepValue(node: NodeState): number {
  return AI.sizeValue[node.size] + (node.building ? AI.buildingValueBonus * node.building.level : 0);
}

/**
 * Reinforces own nodes that incoming hostile units would capture, the most valuable first (helpers are shared).
 * Returns ids of threatened nodes.
 */
function defend(world: World, side: Side, dist: Distances, plan: Plan): Set<string> {
  const threatened = new Set<string>();

  // Any hostile unit counts: the opponent's and bandit raids.
  const byValue = [...threats(world, side)].sort(([a], [b]) => keepValue(world.nodes[b]!) - keepValue(world.nodes[a]!));
  for (const [nodeId, threat] of byValue) {
    const node = world.nodes[nodeId]!;
    // Defender-equivalents the attack takes away: tower shots first, a fortress defender takes two attackers.
    const hostile = Math.max(0, threat.units - towerKillsEstimate(node, threat.units, threat.units)) / defenseMult(node);
    if (hostile === 0) continue;

    const friendly = world.incoming[node.id]![side] + pendingTo(world, node.id, side);
    const defense = node.troops + friendly + troopRate(node, world.sides[side].modifiers) * threat.soonestSec;
    let deficit = hostile - defense + 1;
    if (deficit <= 0) continue;
    threatened.add(node.id);

    // Helpers that arrive in time, nearest first.
    const helpers = own(world, side)
      .filter((n) => n.id !== node.id)
      .map((n) => ({ n, d: dist.get(n.id, node.id) }))
      .filter((h): h is { n: NodeState; d: number } => h.d !== null && etaSec(h.d) <= threat.soonestSec)
      .sort((a, b) => a.d - b.d);
    // A helper's stream takes time to leave: only the units that get there before the attack count.
    for (const { n, d } of helpers) {
      if (deficit <= 0) break;
      deficit -= unitsInTime(send(world, plan, side, n, node.id), d, threat.soonestSec);
    }
  }
  return threatened;
}

// ---- Economy ------------------------------------------------------------------------------------

function isFrontier(world: World, node: NodeState, side: Side): boolean {
  return world.roads.some(([a, b]) => {
    const other = a === node.id ? b : b === node.id ? a : null;
    return other !== null && world.nodes[other]!.owner !== side;
  });
}

/** One build or upgrade per decision; the order depends on the leader's build style (see BuildStyle). */
function spendGold(
  world: World,
  side: Side,
  aggression: number,
  style: Omit<LeaderPreset, 'aggression' | 'thinkMs'>,
  threatened: Set<string>,
  plan: Plan,
): void {
  const nodes = own(world, side);
  // Temples can't hold buildings.
  const empty = nodes.filter((n) => !n.building && n.kind !== 'temple');
  const buildPrice = buildCost(0)!;
  const reserve = style.build === 'rare' ? style.buildReserve : 0;

  const tryBuild = (node: NodeState | undefined, building: BuildingType): boolean => {
    if (!node || plan.gold < buildPrice + reserve) return false;
    plan.gold -= buildPrice;
    plan.commands.push({ type: 'build', side, nodeId: node.id, building });
    return true;
  };

  const bySize = [...empty].sort((a, b) => nodeCapacity(b) - nodeCapacity(a));
  const rear = bySize.find((n) => !isFrontier(world, n, side));
  const front = bySize.find((n) => isFrontier(world, n, side));
  const threatenedEmpty = empty.find((n) => threatened.has(n.id));

  if (style.build === 'rare') {
    // Barracks only, and only with gold to spare.
    if (tryBuild(rear ?? bySize[0], 'barracks')) return;
  } else {
    // 1. Mines pay for everything else.
    if (tryBuild(empty.find((n) => n.hasGoldVein), 'mine')) return;
    // 2. Front line: towers on threatened nodes (defensive: on every front-line node).
    if (tryBuild(threatenedEmpty, 'tower')) return;
    if (style.build === 'defensive' && tryBuild(front, 'tower')) return;
    // 3. Barracks on the biggest empty rear node; on the front, towers for cautious AIs and barracks for aggressive ones.
    if (tryBuild(rear, 'barracks')) return;
    const frontBuilding: BuildingType =
      style.build === 'economy' ? 'barracks' : aggression < AI.towerAggressionThreshold ? 'tower' : 'barracks';
    if (tryBuild(bySize[0], frontBuilding)) return;
  }
  if (plan.gold < reserve) return;

  // 4. Upgrades, lowest level first: mines, barracks, towers (defensive: towers first).
  const order: BuildingType[] = style.build === 'defensive' ? ['tower', 'mine', 'barracks'] : ['mine', 'barracks', 'tower'];
  const upgradable = nodes
    .filter((n) => n.building && n.building.level < BUILDINGS.maxLevel)
    .sort(
      (a, b) =>
        order.indexOf(a.building!.type) - order.indexOf(b.building!.type) || a.building!.level - b.building!.level,
    );
  for (const node of upgradable) {
    const cost = buildCost(node.building!.level)!;
    if (plan.gold < cost + reserve) continue;
    plan.gold -= cost;
    plan.commands.push({ type: 'upgrade', side, nodeId: node.id });
    return;
  }
}

// ---- Attack -------------------------------------------------------------------------------------

function attack(world: World, ai: AiState, threatened: Set<string>, dist: Distances, plan: Plan): void {
  const side = ai.side;
  const aggression = ai.params.aggression;
  const style = styleOf(ai.params);
  const baseMargin = AI.attackMarginMax + (AI.attackMarginMin - AI.attackMarginMax) * aggression;
  // Leaders like the king need a big advantage against the opponent, except right after being attacked.
  const retaliating = (world.tick - ai.lastAttackedTick) * TICK_MS <= style.retaliateMs;
  const opponentMargin = Math.max(0, baseMargin + (retaliating ? 0 : style.opponentMarginExtra));
  const maxAttacks = 1 + Math.round((AI.maxAttacksPerThink - 1) * aggression);

  for (let launched = 0; launched < maxAttacks; launched++) {
    const sources = own(world, side).filter((n) => !threatened.has(n.id) && available(world, n, plan) > 0);
    if (sources.length === 0) return;

    let best: { target: NodeState; picks: NodeState[]; score: number } | null = null;
    for (const target of Object.values(world.nodes)) {
      if (target.owner === side || target.shieldTicks > 0) continue;

      const reachable = sources
        .map((n) => ({ n, d: dist.get(n.id, target.id) }))
        .filter((s): s is { n: NodeState; d: number } => s.d !== null)
        .sort((a, b) => a.d - b.d);
      if (reachable.length === 0) continue;

      // Pick nearest sources until their units beat the estimated defense at arrival.
      const alreadyComing = world.incoming[target.id]![side] + pendingTo(world, target.id, side);
      const picks: NodeState[] = [];
      let force = alreadyComing;
      let required = Infinity;
      let farthest = 0;
      const margin = isRival(side, target.owner) ? opponentMargin : baseMargin;
      for (const { n, d } of reachable) {
        picks.push(n);
        force += available(world, n, plan);
        farthest = Math.max(farthest, d);
        // The target produces only until the first unit reaches it (then it is attacked, GDD 3.6).
        required = requiredForce(world, target, etaSec(farthest), margin);
        if (force >= required) break;
      }
      if (force < required) continue;

      let value = targetValue(side, target, aggression);
      if (ai.params.goalTargets?.includes(target.id)) value += AI.goalTargetValue;
      // Opportunists (witch) go for opponent nodes that just sent their troops away.
      if (style.weakenedBonus > 0 && isRival(side, target.owner) && recentDrop(ai.snapshots, target.id, target.troops) > 0) {
        value *= 1 + style.weakenedBonus;
      }
      const score = value / (required + farthest * AI.distanceCost);
      if (!best || score > best.score) best = { target, picks, score };
    }
    if (!best) return;
    for (const n of best.picks) send(world, plan, side, n, best.target.id);
  }
}

/** Troops needed to capture `target` if the units arrive in `etaSec`. */
function requiredForce(world: World, target: NodeState, eta: number, margin: number): number {
  // Opponent nodes keep producing while the units march (up to capacity); neutrals don't.
  let defenders = target.troops;
  if (target.owner !== 'neutral' && defenders < nodeCapacity(target)) {
    defenders = Math.min(nodeCapacity(target), defenders + troopRate(target, world.sides[target.owner].modifiers) * eta);
  }
  const hits = defenders * defenseMult(target);
  // The tower shoots from when the head of the column enters its zone until the tail reaches the node (docs/TOWER.md):
  // about rate x (its release time + the walk through the zone), plus the shot in reserve.
  const rate = towerRate(target);
  const tower = rate > 0 ? 1 + rate * (hits / (STREAM.releasePerSec * STREAM.width) + towerZoneSec(target)) : 0;
  return hits * (1 + margin) + tower + AI.flatMargin;
}

function targetValue(side: Side, target: NodeState, aggression: number): number {
  let value = AI.sizeValue[target.size];
  if (target.hasGoldVein) value += AI.goldVeinValue;
  if (target.building) value += AI.buildingValueBonus * target.building.level;
  if (target.kind === 'temple') value += AI.templeValue;
  if (target.kind === 'chest') value += AI.chestValue;
  // The player and a second enemy are equal targets (GDD 3.2).
  if (isRival(side, target.owner)) value *= 1 + aggression * AI.opponentTargetBonus;
  return value;
}

// ---- Consolidation ------------------------------------------------------------------------------

/** Rear nodes near capacity push troops one step towards the nearest foreign node, so production isn't wasted. */
function consolidate(world: World, side: Side, threatened: Set<string>, dist: Distances, plan: Plan): void {
  const foreign = Object.values(world.nodes).filter((n) => n.owner !== side);
  if (foreign.length === 0) return;
  const frontDistance = (id: string): number =>
    Math.min(...foreign.map((f) => dist.get(id, f.id) ?? Infinity));

  for (const node of own(world, side)) {
    if (threatened.has(node.id) || isFrontier(world, node, side)) continue;
    if (node.troops < nodeCapacity(node) * AI.consolidateAt || available(world, node, plan, 'pull') === 0) continue;

    const here = frontDistance(node.id);
    const next = world.roads
      .flatMap(([a, b]) => (a === node.id ? [b] : b === node.id ? [a] : []))
      .filter((id) => world.nodes[id]!.owner === side)
      .map((id) => ({ id, d: frontDistance(id) }))
      .filter((c) => c.d < here)
      .sort((a, b) => a.d - b.d)[0];
    if (next) send(world, plan, side, node, next.id, 'pull');
  }
}
