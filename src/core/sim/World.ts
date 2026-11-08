import { ARMY, SPECIAL_NODES, SPELL_IDS, STREAM, TICK_MS, type BuildingType, type NodeKind, type NodeSize, type SpellId } from '../../config/balance';
import type { LevelData } from '../level/schema';
import type { Goal } from './victory';
import { createCitadel, type CitadelState } from './specials/citadel';
import { createDragon, type DragonState } from './specials/dragon';
import { createMage, type MageState } from './specials/mage';
import { nextRandom, seedState } from './rng';

/** Length of the invisible portal road, field units: the distance a unit covers in portal.delayMs. */
export const PORTAL_LENGTH = (ARMY.speed * SPECIAL_NODES.portal.delayMs) / 1000;

export type Owner = 'player' | 'enemy' | 'enemy2' | 'neutral';
export type Side = Exclude<Owner, 'neutral'>;
/** All sides; 'enemy2' is the optional second enemy (GDD 3.2) and stays inert without nodes. */
export const SIDES: readonly Side[] = ['player', 'enemy', 'enemy2'];
export const ENEMY_SIDES: readonly Side[] = ['enemy', 'enemy2'];

/** Whether `owner` is a hostile side for `side` (another non-neutral side). */
export function isRival(side: Side, owner: Owner): boolean {
  return owner !== 'neutral' && owner !== side;
}
export type BuildingLevel = 1 | 2 | 3;

export interface Building {
  type: BuildingType;
  level: BuildingLevel;
}

export interface NodeState {
  id: string;
  /** Normalized level coordinates, 0..1. */
  x: number;
  y: number;
  size: NodeSize;
  owner: Owner;
  /** Fractional internally; UI shows floor. */
  troops: number;
  hasGoldVein: boolean;
  building: Building | null;
  kind: NodeKind;
  /** Portal pair id (portals only). */
  portalPair: string | null;
  /** Bandit camps: tick of the next raid. */
  raidTick: number | null;
  /** Shield spell: ticks left while the node can't be attacked (0 = no shield). */
  shieldTicks: number;
  /** Battle time (ms) until which the node counts as attacked (GDD 3.6). */
  attackedUntilMs: number;
  /** Battle time (ms) of the next tower shot; a shot is ready when it has passed (one held in reserve). */
  towerReadyAtMs: number;
  /** Active streams leaving the node (its own order and transit forwarding; citadel waves not counted). */
  streams: number;
  /**
   * Units the node released onto roads this battle (streams of every kind: orders, transit, citadel waves, raids).
   * View only (docs/FX.md FX-3: the release effect compares it with the last frame); the rules never read it.
   */
  released: number;
}

/**
 * What is left of a route from one node (GDD 3.6): `path[0]` is the node a unit leaves, the last node is the target.
 * A unit walks only `lanes[0]` (path[0] -> path[1]); at path[1] it either arrives or goes into transit there and
 * leaves again with `next`. Suffixes are built once per order and shared by every unit and stream of it.
 */
export interface Route {
  path: readonly string[];
  /** lanes[i] = lane of path[i] -> path[i + 1]. */
  lanes: readonly number[];
  /** The route from path[1] on; null when path[1] is the target. */
  next: Route | null;
}

/**
 * Units waiting in a node to leave along `route` (GDD 3.6): a swipe, transit forwarding or a raid. Until a unit
 * leaves it stays in the garrison (counted in the node's troops). Units leave when the road's entry is free
 * (lane density), taking turns with other streams of the node on the same road.
 */
export interface StreamState {
  id: number;
  sourceId: string;
  /** 'neutral' for bandit raids. */
  owner: Owner;
  route: Route;
  /** Units still to release. */
  left: number;
  /** Tick of the last release (-1: none yet); the stream that waited longest goes first on a shared road. */
  lastReleaseTick: number;
  /** Forwarding units in transit: they may leave even the last troop (they were only passing through). */
  transit: boolean;
  /**
   * Extra units on top of the garrison (citadel waves): releasing doesn't take troops from the source,
   * a re-swipe doesn't cancel it and it is not in the node's `streams` count.
   */
  extra: boolean;
}

/** One unit on a road. Plain object; its route is shared with its stream. */
export interface UnitState {
  id: number;
  owner: Owner;
  /** Remaining route from the node it left; the unit walks route.lanes[0]. */
  route: Route;
  /** 0..1 along its road, between lane.startP and lane.endP. */
  progress: number;
  /** Index in world.units (swap-remove). -1 once the unit is gone. */
  slot: number;
}

/**
 * One direction of a road (or a portal link). Units in a lane all move at the same speed, so they never overtake:
 * `units` stays ordered from the head (highest progress) to the tail.
 */
export interface Lane {
  from: string;
  to: string;
  length: number;
  /**
   * Progress where units appear (STREAM.edgeDist of `from`) and arrive (edgeDist of `to`): just inside the drawn
   * circles. Portal links: 0 and 1.
   */
  startP: number;
  endP: number;
  /** Portal links have no clashes inside. */
  portal: boolean;
  /** Lane of the same road in the opposite direction. */
  reverse: number;
  units: UnitState[];
}

export interface SpellModifiers {
  fireball: { killShareBonus: number; cooldownReductionSec: number };
  reinforcement: { extraTroops: number; cooldownReductionSec: number };
  shield: { extraDurationSec: number; cooldownReductionSec: number };
}

/** Bonuses from meta progression (player) or level params (enemy). */
export interface SideModifiers {
  troopProductionMult: number;
  goldIncomeMult: number;
  spells: SpellModifiers;
}

export interface SideState {
  gold: number;
  unlockedSpells: SpellId[];
  /** Remaining cooldown in ms (integers, so ticks count down exactly). */
  spellCooldowns: Record<SpellId, number>;
  modifiers: SideModifiers;
}

export interface World {
  tick: number;
  nodes: Record<string, NodeState>;
  roads: Array<[string, string]>;
  /** Portal links (invisible roads between the two nodes of a pair). */
  portals: Array<[string, string]>;
  streams: StreamState[];
  /** Every unit on the field, in no particular order (swap-remove). */
  units: UnitState[];
  /** Road lanes: 2r = roads[r] a -> b, 2r + 1 = b -> a; then portal links the same way. */
  lanes: Lane[];
  /** Lane index by "from>to" (built once at load; used when a stream is created, not per tick). */
  laneIndex: Record<string, number>;
  /** Lanes that end at each node. */
  lanesInto: Record<string, number[]>;
  /** Units on the field heading to each node, by owner (AI and previews read this instead of scanning units). */
  incoming: Record<string, Record<Owner, number>>;
  sides: Record<Side, SideState>;
  nextUnitId: number;
  nextStreamId: number;
  rngState: number;
  winner: Side | null;
  goal: Goal;
  /** Hold goal: ticks the player has held the node in a row. */
  goalTicks: number;
  /** Start capitals of the sides (level `capital` flags), for the capital goal. */
  capitals: Record<Side, string | null>;
  /** Boss mechanic of the level, if any. */
  boss: DragonState | CitadelState | MageState | null;
}

export function defaultModifiers(): SideModifiers {
  return {
    troopProductionMult: 1,
    goldIncomeMult: 1,
    spells: {
      fireball: { killShareBonus: 0, cooldownReductionSec: 0 },
      reinforcement: { extraTroops: 0, cooldownReductionSec: 0 },
      shield: { extraDurationSec: 0, cooldownReductionSec: 0 },
    },
  };
}

export interface PlayerSetup {
  modifiers?: SideModifiers;
  /** Extra troops added to every starting player node. */
  startArmyBonus?: number;
  unlockedSpells?: SpellId[];
}

export interface WorldOptions {
  seed?: number;
  player?: PlayerSetup;
}

function zeroCooldowns(): Record<SpellId, number> {
  return Object.fromEntries(SPELL_IDS.map((id) => [id, 0])) as Record<SpellId, number>;
}

export function createWorld(level: LevelData, options: WorldOptions = {}): World {
  const player = options.player ?? {};
  const startArmyBonus = player.startArmyBonus ?? 0;

  const nodes: Record<string, NodeState> = {};
  for (const n of level.nodes) {
    nodes[n.id] = {
      id: n.id,
      x: n.x,
      y: n.y,
      size: n.size,
      owner: n.owner,
      troops: n.troops + (n.owner === 'player' ? startArmyBonus : 0),
      hasGoldVein: n.hasGoldVein,
      building: n.building ? { ...n.building } : null,
      kind: n.kind ?? 'normal',
      portalPair: n.portalPair ?? null,
      raidTick: n.kind === 'bandits' ? Math.round(SPECIAL_NODES.bandits.raidEveryMs / TICK_MS) : null,
      shieldTicks: 0,
      attackedUntilMs: 0,
      towerReadyAtMs: 0,
      streams: 0,
      released: 0,
    };
  }
  const pairs = new Map<string, string[]>();
  for (const n of level.nodes) if (n.portalPair) pairs.set(n.portalPair, [...(pairs.get(n.portalPair) ?? []), n.id]);
  const portals = [...pairs.values()].filter((ids) => ids.length === 2).map(([a, b]) => [a!, b!] as [string, string]);

  const enemySide = (params: LevelData['enemy'] | undefined): SideState => {
    const modifiers = defaultModifiers();
    modifiers.troopProductionMult = params?.productionMult ?? 1;
    // TODO(design): GDD does not say whether the enemy AI uses spells; it has none for now.
    return { gold: params?.startGold ?? 0, unlockedSpells: [], spellCooldowns: zeroCooldowns(), modifiers };
  };

  const roads = level.roads.map(([a, b]) => [a, b] as [string, string]);
  const { lanes, laneIndex, lanesInto } = buildLanes(nodes, roads, portals);
  const incoming: Record<string, Record<Owner, number>> = {};
  for (const id of Object.keys(nodes)) incoming[id] = { player: 0, enemy: 0, enemy2: 0, neutral: 0 };

  return {
    tick: 0,
    nodes,
    roads,
    portals,
    streams: [],
    units: [],
    lanes,
    laneIndex,
    lanesInto,
    incoming,
    sides: {
      player: {
        gold: level.playerStartGold,
        unlockedSpells: [...(player.unlockedSpells ?? [])],
        spellCooldowns: zeroCooldowns(),
        modifiers: structuredClone(player.modifiers ?? defaultModifiers()),
      },
      enemy: enemySide(level.enemy),
      enemy2: enemySide(level.enemy2),
    },
    nextUnitId: 1,
    nextStreamId: 1,
    rngState: seedState(options.seed ?? 1),
    winner: null,
    goal: level.goal ? structuredClone(level.goal) : { type: 'conquer' },
    goalTicks: 0,
    capitals: {
      player: level.nodes.find((n) => n.capital && n.owner === 'player')?.id ?? null,
      enemy: level.nodes.find((n) => n.capital && n.owner === 'enemy')?.id ?? null,
      enemy2: level.nodes.find((n) => n.capital && n.owner === 'enemy2')?.id ?? null,
    },
    boss:
      level.special?.type === 'dragon'
        ? createDragon()
        : level.special?.type === 'citadel'
          ? createCitadel(String(level.special.params.nodeId))
          : level.special?.type === 'mage'
            ? createMage(level.nodes.find((n) => n.capital && n.owner === 'enemy')!.id)
            : null,
  };
}

/** Lanes of all roads and portal links (both directions), with lookups by endpoints. */
function buildLanes(
  nodes: Record<string, NodeState>,
  roads: ReadonlyArray<readonly [string, string]>,
  portals: ReadonlyArray<readonly [string, string]>,
): Pick<World, 'lanes' | 'laneIndex' | 'lanesInto'> {
  const lanes: Lane[] = [];
  const laneIndex: Record<string, number> = {};
  const lanesInto: Record<string, number[]> = {};
  for (const id of Object.keys(nodes)) lanesInto[id] = [];
  const add = (a: string, b: string, portal: boolean): void => {
    const length = portal ? PORTAL_LENGTH : Math.hypot(nodes[a]!.x - nodes[b]!.x, nodes[a]!.y - nodes[b]!.y);
    const i = lanes.length;
    lanes.push({ from: a, to: b, length, startP: 0, endP: 1, portal, reverse: i + 1, units: [] });
    lanes.push({ from: b, to: a, length, startP: 0, endP: 1, portal, reverse: i, units: [] });
    setLaneEnds(lanes[i]!, nodes);
    setLaneEnds(lanes[i + 1]!, nodes);
    laneIndex[`${a}>${b}`] = i;
    laneIndex[`${b}>${a}`] = i + 1;
    lanesInto[b]!.push(i);
    lanesInto[a]!.push(i + 1);
  };
  for (const [a, b] of roads) add(a, b, false);
  for (const [a, b] of portals) add(a, b, true);
  return { lanes, laneIndex, lanesInto };
}

/**
 * Where units appear and arrive on a lane (GDD 3.6): STREAM.edgeDist from each node center, by node size.
 * A road too short for both edges gets them at its middle.
 */
export function setLaneEnds(lane: Lane, nodes: Record<string, NodeState>): void {
  if (lane.portal || lane.length <= 0) {
    lane.startP = 0;
    lane.endP = 1;
    return;
  }
  const start = STREAM.edgeDist[nodes[lane.from]!.size] / lane.length;
  const end = 1 - STREAM.edgeDist[nodes[lane.to]!.size] / lane.length;
  if (start < end) {
    lane.startP = start;
    lane.endP = end;
  } else {
    lane.startP = lane.endP = (start + end) / 2;
  }
}

/** A node changed size (a captured chest): moves the ends of the lanes touching it. */
export function refreshLaneEnds(world: World, nodeId: string): void {
  for (const lane of world.lanes) if (lane.from === nodeId || lane.to === nodeId) setLaneEnds(lane, world.nodes);
}

/**
 * Rebuilds the lanes after nodes or roads were added to an existing world (editors, tests). Only valid while no
 * units are on the field.
 */
export function reindexRoads(world: World): void {
  Object.assign(world, buildLanes(world.nodes, world.roads, world.portals));
  for (const id of Object.keys(world.nodes)) world.incoming[id] ??= { player: 0, enemy: 0, enemy2: 0, neutral: 0 };
}

/** Battle time in ms. */
export function nowMs(world: World): number {
  return world.tick * TICK_MS;
}

/** Whether the node counts as attacked right now (GDD 3.6): no sending, no production. */
export function isAttacked(world: World, node: NodeState): boolean {
  return nowMs(world) < node.attackedUntilMs;
}

export function nodesOf(world: World, owner: Owner): NodeState[] {
  return Object.values(world.nodes).filter((n) => n.owner === owner);
}

/** How many attackers one defender of `node` withstands (fortress: 2, GDD 3.12). */
export function defenseMult(node: NodeState): number {
  return node.kind === 'fortress' ? SPECIAL_NODES.fortress.defenseMult : 1;
}

/** Share of all nodes (neutrals included) owned by `owner`, 0..1. */
export function ownedShare(world: World, owner: Owner): number {
  const all = Object.values(world.nodes);
  return all.length === 0 ? 0 : all.filter((n) => n.owner === owner).length / all.length;
}

/** Random number in [0, 1) from the world's seeded RNG. */
export function random(world: World): number {
  const [value, next] = nextRandom(world.rngState);
  world.rngState = next;
  return value;
}
