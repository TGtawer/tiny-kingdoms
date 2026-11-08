import { BUILDINGS, ECONOMY, SPECIAL_NODES, STREAM } from '../../config/balance';
import { captureNode } from './capture';
import { dropForeignStreams } from './stream';
import { defenseMult, nowMs, refreshLaneEnds, type NodeState, type Owner, type World } from './World';

/** Below this, a remainder counts as zero (guards against float noise). */
const EPSILON = 1e-9;

export type ArrivalOutcome = 'reinforced' | 'repelled' | 'captured' | 'shielded';

export interface ArrivalResult {
  unitId: number;
  owner: Owner;
  nodeId: string;
  /** The node the unit came from (the start of its last road), for effects. */
  fromId: string;
  outcome: ArrivalOutcome;
  /** Gold the capturer got from a chest (0 otherwise). */
  /** Gold the capture gave the capturer: a chest's gold, or ECONOMY.neutralCaptureGold for a neutral node. */
  captureGold: number;
}

/** Tower shots per second of the node (0 without a tower). */
export function towerRate(node: NodeState): number {
  if (node.building?.type !== 'tower') return 0;
  return BUILDINGS.tower.shotsPerSec[node.building.level - 1]!;
}

/**
 * Takes the tower's shot if one is ready (docs/TOWER.md; the caller has a target in the zone). One shot is held in
 * reserve: a tower that waited fires at once, then reloads for 1 / rate s. A shot that became ready less than one
 * reload ago keeps its phase, so a steady stream loses `rate` units per second even though shots fall on whole
 * ticks; never two shots in one moment.
 */
export function towerShoots(world: World, node: NodeState): boolean {
  const rate = towerRate(node);
  if (rate <= 0) return false;
  const now = nowMs(world);
  if (node.towerReadyAtMs > now) return false;
  const reload = 1000 / rate;
  const base = node.towerReadyAtMs > now - reload ? node.towerReadyAtMs : now;
  node.towerReadyAtMs = Math.max(base + reload, now + 1);
  return true;
}

/**
 * How many attackers in a row the garrison stops by 1:1 trades (fortress defenders take two each), after which the
 * next attacker captures. Tower shots (on the roads, before the node) are not included.
 */
export function defenseHits(node: NodeState): number {
  return Math.floor(node.troops * defenseMult(node) + EPSILON);
}

/** Marks the node attacked (GDD 3.6): its garrison took damage — a hostile unit, a fireball, the mage, the dragon. */
export function markAttacked(world: World, node: NodeState): void {
  node.attackedUntilMs = nowMs(world) + STREAM.attackWindowMs;
}

/**
 * One unit of `owner` reaches `node` (GDD 3.6). Own node: it joins the garrison (over capacity is fine).
 * Foreign node: a shield breaks it; else it trades 1:1 with a defender (a fortress defender withstands two); with
 * less than one defender left the node is captured and the unit is its garrison. Every hostile arrival except on a
 * shield marks the node attacked for STREAM.attackWindowMs. A tower does not shoot here: it shoots on the roads,
 * before the node (towers.ts, docs/TOWER.md).
 */
export function arriveUnit(world: World, unitId: number, owner: Owner, node: NodeState, fromId = node.id): ArrivalResult {
  const base = { unitId, owner, nodeId: node.id, fromId, captureGold: 0 };

  if (node.owner === owner) {
    node.troops += 1;
    return { ...base, outcome: 'reinforced' };
  }
  // TODO(design): GDD 3.8 — how the shield works with streams is TBD; for now a shielded node is not attacked.
  if (node.shieldTicks > 0) return { ...base, outcome: 'shielded' };

  markAttacked(world, node);

  const perAttacker = 1 / defenseMult(node);
  if (node.troops + EPSILON >= perAttacker) {
    node.troops = Math.max(0, node.troops - perAttacker);
    return { ...base, outcome: 'repelled' };
  }

  // A chest gives its gold (as before), any other neutral node ECONOMY.neutralCaptureGold; a node taken from another
  // side gives nothing. Bandits taking a node get nothing either.
  const gold =
    owner === 'neutral' ? 0 : node.kind === 'chest' ? SPECIAL_NODES.chest.gold : node.owner === 'neutral' ? ECONOMY.neutralCaptureGold : 0;
  const size = node.size;
  captureNode(node, owner, 1);
  dropForeignStreams(world, node.id);
  // A chest becomes a small node: units now appear and arrive closer to its center.
  if (node.size !== size) refreshLaneEnds(world, node.id);
  // The capturer's node is not under its own attack.
  node.attackedUntilMs = 0;
  if (gold > 0 && owner !== 'neutral') world.sides[owner].gold += gold;
  return { ...base, outcome: 'captured', captureGold: gold };
}
