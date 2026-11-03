import { AI, ARMY, BUILDINGS, TICK_MS, type BuildingType } from '../../config/balance';
import { towerDamage } from '../sim/combat';
import { buildCost, sendAmount, validate, type Command, type SendMode } from '../sim/commands';
import { nodeCapacity, troopRate } from '../sim/economy';
import { armyPath, routeLength, segmentLength } from '../sim/pathfinding';
import { defenseStrength, opponentOf, random, strengthOf, type NodeState, type Side, type World } from '../sim/World';
import type { EnemyParams } from '../level/schema';

/** AI params from level data. */
export function aiParamsFromLevel(enemy: EnemyParams): AiParams {
  return { thinkMs: enemy.aiThinkMs, aggression: enemy.aggression, startDelayMs: enemy.aiStartDelayMs ?? 0 };
}

export interface AiParams {
  /** Time between decisions, ms. */
  thinkMs: number;
  /** 0 = cautious, 1 = reckless. */
  aggression: number;
  /** No decisions before this time, ms (tutorial levels). */
  startDelayMs?: number;
}

/** Serializable AI state; the AI itself is the pure function `aiStep`. */
export interface AiState {
  side: Side;
  params: AiParams;
  nextThinkTick: number;
}

export function createAi(side: Side, params: AiParams): AiState {
  // First decision after one think interval (or the start delay), so the player gets a moment at the start.
  const firstMs = Math.max(params.thinkMs, params.startDelayMs ?? 0);
  return { side, params: { ...params }, nextThinkTick: Math.max(1, Math.round(firstMs / TICK_MS)) };
}

/**
 * Called every tick before `step`. Returns commands on decision ticks, otherwise [].
 * Plays by the same rules as the player: every command goes through `validate`.
 */
export function aiStep(world: World, ai: AiState): Command[] {
  if (world.winner || world.tick < ai.nextThinkTick) return [];
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

  const threatened = defend(world, side, dist, plan);
  spendGold(world, side, ai.params.aggression, threatened, plan);
  attack(world, ai, threatened, dist, plan);
  consolidate(world, side, threatened, dist, plan);

  // Same rules as the player: drop anything the simulation would reject.
  return plan.commands.filter((cmd) => validate(world, cmd) === null);
}

function own(world: World, side: Side): NodeState[] {
  return Object.values(world.nodes).filter((n) => n.owner === side);
}

/**
 * Troops a node can still send in this decision (one send per node per decision).
 * Same rules as the player: attacks and defense are swipes (75%), pushing troops to the front is a tap (50%),
 * so the rear is never emptied.
 */
function available(node: NodeState, plan: Plan, mode: SendMode = 'swipe'): number {
  return plan.sent.has(node.id) ? 0 : sendAmount(node.troops, mode);
}

function send(plan: Plan, side: Side, from: NodeState, to: string, mode: SendMode = 'swipe'): number {
  const count = available(from, plan, mode);
  if (count <= 0 || from.id === to) return 0;
  plan.sent.set(from.id, count);
  plan.commands.push({ type: 'send', side, from: from.id, to, mode });
  return count;
}

function etaSec(distance: number): number {
  return distance / ARMY.speed;
}

/** Troop strength ratio: how many own troops one defender is worth (fortresses count double). */
function strengthRatio(world: World, attacker: Side, defender: NodeState): number {
  return defenseStrength(world, defender) / strengthOf(world, attacker);
}

// ---- Defense ------------------------------------------------------------------------------------

/** Reinforces own nodes that incoming hostile armies would capture. Returns ids of threatened nodes. */
function defend(world: World, side: Side, dist: Distances, plan: Plan): Set<string> {
  const threatened = new Set<string>();

  for (const node of own(world, side)) {
    // Any hostile army counts: the opponent's and bandit raids.
    const incoming = world.armies.filter((a) => a.owner !== side && a.targetId === node.id);
    if (incoming.length === 0) continue;

    let hostile = 0;
    let soonest = Infinity;
    for (const army of incoming) {
      const eta = armyEtaSec(world, army.path, army.segment, army.progress);
      if (eta > AI.defendLookaheadSec) continue;
      hostile += (Math.max(0, army.count - towerDamage(node)) * strengthOf(world, army.owner)) / defenseStrength(world, node);
      soonest = Math.min(soonest, eta);
    }
    if (hostile === 0) continue;

    const friendly = world.armies
      .filter((a) => a.owner === side && a.targetId === node.id)
      .reduce((sum, a) => sum + a.count, 0);
    const defense = node.troops + friendly + troopRate(node, world.sides[side].modifiers) * soonest;
    let deficit = hostile - defense + 1;
    if (deficit <= 0) continue;
    threatened.add(node.id);

    // Helpers that arrive in time, nearest first.
    const helpers = own(world, side)
      .filter((n) => n.id !== node.id)
      .map((n) => ({ n, d: dist.get(n.id, node.id) }))
      .filter((h): h is { n: NodeState; d: number } => h.d !== null && etaSec(h.d) <= soonest)
      .sort((a, b) => a.d - b.d);
    for (const { n } of helpers) {
      if (deficit <= 0) break;
      deficit -= send(plan, side, n, node.id);
    }
  }
  return threatened;
}

function armyEtaSec(world: World, path: readonly string[], segment: number, progress: number): number {
  let remaining = 0;
  for (let i = segment; i + 1 < path.length; i++) {
    const len = segmentLength(world, path[i]!, path[i + 1]!);
    remaining += i === segment ? len * (1 - progress) : len;
  }
  return etaSec(remaining);
}

// ---- Economy ------------------------------------------------------------------------------------

function isFrontier(world: World, node: NodeState, side: Side): boolean {
  return world.roads.some(([a, b]) => {
    const other = a === node.id ? b : b === node.id ? a : null;
    return other !== null && world.nodes[other]!.owner !== side;
  });
}

/** One build or upgrade per decision, by priority: mines, front-line defense, barracks, upgrades. */
function spendGold(world: World, side: Side, aggression: number, threatened: Set<string>, plan: Plan): void {
  const nodes = own(world, side);
  // Temples can't hold buildings.
  const empty = nodes.filter((n) => !n.building && n.kind !== 'temple');
  const buildPrice = buildCost(0)!;

  const tryBuild = (node: NodeState | undefined, building: BuildingType): boolean => {
    if (!node || plan.gold < buildPrice) return false;
    plan.gold -= buildPrice;
    plan.commands.push({ type: 'build', side, nodeId: node.id, building });
    return true;
  };

  // 1. Mines pay for everything else.
  if (tryBuild(empty.find((n) => n.hasGoldVein), 'mine')) return;

  // 2. Front line: towers on threatened nodes.
  const threatenedEmpty = empty.find((n) => threatened.has(n.id));
  if (tryBuild(threatenedEmpty, 'tower')) return;

  // 3. Barracks on the biggest empty rear node; on the front, towers for cautious AIs and barracks for aggressive ones.
  const bySize = [...empty].sort((a, b) => nodeCapacity(b) - nodeCapacity(a));
  const rear = bySize.find((n) => !isFrontier(world, n, side));
  if (tryBuild(rear, 'barracks')) return;
  const frontBuilding: BuildingType = aggression < AI.towerAggressionThreshold ? 'tower' : 'barracks';
  if (tryBuild(bySize[0], frontBuilding)) return;

  // 4. Upgrades: mines first, then barracks, then towers, lowest level first.
  const order: BuildingType[] = ['mine', 'barracks', 'tower'];
  const upgradable = nodes
    .filter((n) => n.building && n.building.level < BUILDINGS.maxLevel)
    .sort(
      (a, b) =>
        order.indexOf(a.building!.type) - order.indexOf(b.building!.type) || a.building!.level - b.building!.level,
    );
  for (const node of upgradable) {
    const cost = buildCost(node.building!.level)!;
    if (plan.gold < cost) continue;
    plan.gold -= cost;
    plan.commands.push({ type: 'upgrade', side, nodeId: node.id });
    return;
  }
}

// ---- Attack -------------------------------------------------------------------------------------

function attack(world: World, ai: AiState, threatened: Set<string>, dist: Distances, plan: Plan): void {
  const side = ai.side;
  const aggression = ai.params.aggression;
  const margin = AI.attackMarginMax + (AI.attackMarginMin - AI.attackMarginMax) * aggression;
  const maxAttacks = 1 + Math.round((AI.maxAttacksPerThink - 1) * aggression);

  for (let launched = 0; launched < maxAttacks; launched++) {
    const sources = own(world, side).filter((n) => !threatened.has(n.id) && available(n, plan) > 0);
    if (sources.length === 0) return;

    let best: { target: NodeState; picks: NodeState[]; score: number } | null = null;
    for (const target of Object.values(world.nodes)) {
      if (target.owner === side) continue;

      const reachable = sources
        .map((n) => ({ n, d: dist.get(n.id, target.id) }))
        .filter((s): s is { n: NodeState; d: number } => s.d !== null)
        .sort((a, b) => a.d - b.d);
      if (reachable.length === 0) continue;

      // Pick nearest sources until their armies beat the estimated defense at arrival.
      const alreadyComing = world.armies
        .filter((a) => a.owner === side && a.targetId === target.id)
        .reduce((sum, a) => sum + a.count, 0);
      const picks: NodeState[] = [];
      let force = alreadyComing;
      let required = Infinity;
      let farthest = 0;
      for (const { n, d } of reachable) {
        picks.push(n);
        force += available(n, plan);
        farthest = Math.max(farthest, d);
        required = requiredForce(world, side, target, etaSec(farthest), margin);
        if (force >= required) break;
      }
      if (force < required) continue;

      const score = targetValue(side, target, aggression) / (required + farthest * AI.distanceCost);
      if (!best || score > best.score) best = { target, picks, score };
    }
    if (!best) return;
    for (const n of best.picks) send(plan, side, n, best.target.id);
  }
}

/** Troops needed to capture `target` if the armies arrive in `etaSec`. */
function requiredForce(world: World, side: Side, target: NodeState, eta: number, margin: number): number {
  // Opponent nodes keep producing while the armies march (up to capacity); neutrals don't.
  let defenders = target.troops;
  if (target.owner !== 'neutral' && defenders < nodeCapacity(target)) {
    defenders = Math.min(nodeCapacity(target), defenders + troopRate(target, world.sides[target.owner].modifiers) * eta);
  }
  return defenders * strengthRatio(world, side, target) * (1 + margin) + towerDamage(target) + AI.flatMargin;
}

function targetValue(side: Side, target: NodeState, aggression: number): number {
  let value = AI.sizeValue[target.size];
  if (target.hasGoldVein) value += AI.goldVeinValue;
  if (target.building) value += AI.buildingLevelValue * target.building.level;
  if (target.kind === 'temple') value += AI.templeValue;
  if (target.kind === 'chest') value += AI.chestValue;
  if (target.owner === opponentOf(side)) value *= 1 + aggression * AI.opponentTargetBonus;
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
    if (node.troops < nodeCapacity(node) * AI.consolidateAt || available(node, plan, 'tap') === 0) continue;

    const here = frontDistance(node.id);
    const next = world.roads
      .flatMap(([a, b]) => (a === node.id ? [b] : b === node.id ? [a] : []))
      .filter((id) => world.nodes[id]!.owner === side)
      .map((id) => ({ id, d: frontDistance(id) }))
      .filter((c) => c.d < here)
      .sort((a, b) => a.d - b.d)[0];
    if (next) send(plan, side, node, next.id, 'tap');
  }
}
