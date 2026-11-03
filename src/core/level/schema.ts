import type { Goal } from '../sim/victory';
import { LEADER_IDS, NODE_KINDS, type BuildingType, type LeaderId, type NodeKind, type NodeSize } from '../../config/balance';

export type LevelOwner = 'player' | 'enemy' | 'enemy2' | 'neutral';

export interface LevelNode {
  id: string;
  /** Normalized level coordinates, 0..1. */
  x: number;
  y: number;
  size: NodeSize;
  owner: LevelOwner;
  troops: number;
  hasGoldVein: boolean;
  building: { type: BuildingType; level: 1 | 2 | 3 } | null;
  /**
   * Start castle of its side ("capital"): drawn with a crown, which stays after the node changes owner.
   * At most one per side, only on a player or enemy start node.
   * Matters for the 'capital' goal (GDD 3.9); otherwise visual only.
   */
  capital?: boolean;
  /** Special node (GDD 3.12); default 'normal'. */
  kind?: NodeKind;
  /** Portals only: the two nodes with the same value are linked by an invisible road. */
  portalPair?: string;
}

export interface EnemyParams {
  productionMult: number;
  /** Optional with a leader (the preset's value is used), required otherwise. */
  aiThinkMs?: number;
  /** 0 = cautious, 1 = reckless. Optional with a leader. */
  aggression?: number;
  /** Enemy leader (GDD 3.10): AI character preset; aggression/aiThinkMs above override it. */
  leader?: LeaderId;
  startGold: number;
  /** AI makes no decisions before this time (used on tutorial levels). */
  aiStartDelayMs?: number;
}

export interface LevelData {
  /** e.g. "c01_l01" */
  id: string;
  chapter: number;
  index: number;
  nodes: LevelNode[];
  roads: Array<[string, string]>;
  enemy: EnemyParams;
  /** Second enemy (GDD 3.2, three sides); required when the level has 'enemy2' nodes. */
  enemy2?: EnemyParams;
  playerStartGold: number;
  /**
   * Boss mechanic of 10th levels (GDD 4.1): 'dragon' (no params) or 'citadel' ({ nodeId }: the enemy citadel).
   * TODO(design): bosses of chapters 3–10 are not defined yet.
   */
  special?: { type: 'dragon' | 'citadel'; params: Record<string, unknown> };
  /** Tutorial scenario id (see src/levels/tutorials.json). */
  tutorial?: string;
  /** Win faster than this (simulation seconds) for the "fast" star; default STARS.defaultTimeSec. */
  starTimeSec?: number;
  /** Level goal (GDD 3.9); default conquer. */
  goal?: Goal;
}

/** Limits checked by validation. GDD: 8–20 nodes in general, chapter 1 uses 6–9 (BALANCE.md). */
export const LEVEL_LIMITS = {
  minNodes: 3,
  maxNodes: 20,
  /** Minimum distance between node centers, field units (keeps nodes from overlapping on screen). */
  minNodeDistance: 0.12,
  /** A road must not pass closer than this to a node it does not connect (field units). */
  roadNodeClearance: 0.05,
} as const;

const SIZES: readonly NodeSize[] = ['small', 'medium', 'large'];
const OWNERS: readonly LevelOwner[] = ['player', 'enemy', 'enemy2', 'neutral'];
const BUILDINGS: readonly BuildingType[] = ['mine', 'barracks', 'tower'];

export type ValidationResult = { ok: true; level: LevelData } | { ok: false; errors: string[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);

/** Validates untrusted level JSON: structure, value ranges, graph connectivity and readable geometry. */
export function validateLevel(data: unknown): ValidationResult {
  const errors: string[] = [];
  const err = (msg: string): void => {
    errors.push(msg);
  };

  if (!isObject(data)) return { ok: false, errors: ['level is not an object'] };
  const id = typeof data.id === 'string' && data.id ? data.id : '?';
  const at = (msg: string): void => err(`${id}: ${msg}`);

  if (id === '?') at('id must be a non-empty string');
  if (!isInt(data.chapter) || data.chapter < 0) at('chapter must be an integer >= 0');
  if (!isInt(data.index) || data.index < 1) at('index must be an integer >= 1');
  if (!isNum(data.playerStartGold) || data.playerStartGold < 0) at('playerStartGold must be >= 0');
  if (data.tutorial !== undefined && typeof data.tutorial !== 'string') at('tutorial must be a string');
  if (data.starTimeSec !== undefined && (!isNum(data.starTimeSec) || data.starTimeSec <= 0)) at('starTimeSec must be > 0');

  const checkEnemy = (enemy: unknown, name: string): void => {
    if (!isObject(enemy)) {
      at(`${name} params missing`);
      return;
    }
    const at2 = (msg: string): void => at(msg.replace(/^enemy\./, `${name}.`));
    validateEnemy(enemy, at2);
  };
  checkEnemy(data.enemy, 'enemy');
  const hasEnemy2 = Array.isArray(data.nodes) && data.nodes.some((n) => isObject(n) && n.owner === 'enemy2');
  if (hasEnemy2 || data.enemy2 !== undefined) checkEnemy(data.enemy2, 'enemy2');

  function validateEnemy(enemy: Record<string, unknown>, at: (msg: string) => void): void {
    if (!isNum(enemy.productionMult) || enemy.productionMult <= 0) at('enemy.productionMult must be > 0');
    if (enemy.leader !== undefined && !LEADER_IDS.includes(enemy.leader as LeaderId)) at('enemy.leader is unknown');
    const hasLeader = enemy.leader !== undefined;
    if (!(hasLeader && enemy.aiThinkMs === undefined) && (!isNum(enemy.aiThinkMs) || enemy.aiThinkMs <= 0)) {
      at('enemy.aiThinkMs must be > 0');
    }
    if (
      !(hasLeader && enemy.aggression === undefined) &&
      (!isNum(enemy.aggression) || enemy.aggression < 0 || enemy.aggression > 1)
    ) {
      at('enemy.aggression must be in 0..1');
    }
    if (!isNum(enemy.startGold) || enemy.startGold < 0) at('enemy.startGold must be >= 0');
    if (enemy.aiStartDelayMs !== undefined && (!isNum(enemy.aiStartDelayMs) || enemy.aiStartDelayMs < 0)) {
      at('enemy.aiStartDelayMs must be >= 0');
    }
  }

  const nodes = Array.isArray(data.nodes) ? data.nodes : null;
  if (!nodes) {
    at('nodes must be an array');
    return { ok: false, errors };
  }
  if (nodes.length < LEVEL_LIMITS.minNodes || nodes.length > LEVEL_LIMITS.maxNodes) {
    at(`node count ${nodes.length} outside ${LEVEL_LIMITS.minNodes}..${LEVEL_LIMITS.maxNodes}`);
  }

  const byId = new Map<string, { x: number; y: number }>();
  nodes.forEach((n: unknown, i) => {
    if (!isObject(n) || typeof n.id !== 'string' || !n.id) {
      at(`node #${i} has no id`);
      return;
    }
    const where = `node ${n.id}`;
    if (byId.has(n.id)) at(`${where}: duplicate id`);
    if (!isNum(n.x) || !isNum(n.y) || n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) at(`${where}: x/y must be in 0..1`);
    if (!SIZES.includes(n.size as NodeSize)) at(`${where}: bad size`);
    if (!OWNERS.includes(n.owner as LevelOwner)) at(`${where}: bad owner`);
    if (!isNum(n.troops) || n.troops < 0) at(`${where}: troops must be >= 0`);
    if (typeof n.hasGoldVein !== 'boolean') at(`${where}: hasGoldVein must be boolean`);
    if (n.building !== null) {
      const b = n.building;
      if (!isObject(b) || !BUILDINGS.includes(b.type as BuildingType) || ![1, 2, 3].includes(b.level as number)) {
        at(`${where}: bad building`);
      } else if (b.type === 'mine' && n.hasGoldVein !== true) {
        at(`${where}: mine without gold vein`);
      }
    }
    if (n.kind !== undefined && !NODE_KINDS.includes(n.kind as NodeKind)) at(`${where}: bad kind`);
    if ((n.kind === 'chest' || n.kind === 'bandits') && n.owner !== 'neutral') at(`${where}: ${String(n.kind)} must start neutral`);
    if (n.kind === 'temple' && n.building !== null) at(`${where}: temple cannot have a building`);
    if ((n.kind === 'portal') !== (n.portalPair !== undefined)) at(`${where}: portal needs portalPair and vice versa`);
    if (n.portalPair !== undefined && (typeof n.portalPair !== 'string' || !n.portalPair)) at(`${where}: bad portalPair`);
    if (n.capital !== undefined) {
      if (typeof n.capital !== 'boolean') at(`${where}: capital must be boolean`);
      else if (n.capital && n.owner === 'neutral') at(`${where}: capital must start as player or enemy`);
    }
    if (isNum(n.x) && isNum(n.y)) byId.set(n.id, { x: n.x, y: n.y });
  });

  const special = data.special;
  if (special !== undefined) {
    if (!isObject(special) || !isObject(special.params)) at('special must be { type, params }');
    else if (special.type === 'citadel') {
      const id = special.params.nodeId;
      const n = nodes.find((m) => isObject(m) && m.id === id);
      if (!isObject(n) || n.owner !== 'enemy') at('special citadel: params.nodeId must be an enemy node');
    } else if (special.type !== 'dragon') at('special.type is unknown');
  }

  const goal = data.goal;
  if (goal !== undefined) {
    if (!isObject(goal)) at('goal must be an object');
    else if (goal.type === 'hold') {
      if (typeof goal.nodeId !== 'string' || !byId.has(goal.nodeId)) at('goal.nodeId must be a node');
      if (!isNum(goal.seconds) || goal.seconds <= 0) at('goal.seconds must be > 0');
    } else if (goal.type === 'survive') {
      if (!isNum(goal.seconds) || goal.seconds <= 0) at('goal.seconds must be > 0');
    } else if (goal.type === 'capital') {
      for (const side of ['player', 'enemy']) {
        if (!nodes.some((n) => isObject(n) && n.capital === true && n.owner === side)) at(`goal capital needs a ${side} capital`);
      }
    } else if (goal.type !== 'conquer') at('goal.type is unknown');
  }

  const owners = nodes.filter(isObject).map((n) => n.owner);
  if (!owners.includes('player')) at('no player start node');
  if (!owners.includes('enemy')) at('no enemy start node');
  for (const side of ['player', 'enemy', 'enemy2'] as const) {
    const capitals = nodes.filter((n) => isObject(n) && n.capital === true && n.owner === side).length;
    if (capitals > 1) at(`more than one ${side} capital`);
  }

  // Portals come in pairs.
  const pairs = new Map<string, string[]>();
  for (const n of nodes) {
    if (isObject(n) && typeof n.portalPair === 'string' && typeof n.id === 'string') {
      pairs.set(n.portalPair, [...(pairs.get(n.portalPair) ?? []), n.id]);
    }
  }
  for (const [pair, ids] of pairs) if (ids.length !== 2) at(`portal pair ${pair} must have exactly 2 nodes`);
  const portalLinks = [...pairs.values()].filter((ids) => ids.length === 2) as Array<[string, string]>;

  // Nodes must not overlap.
  const points = [...byId.entries()];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const [a, pa] = points[i]!;
      const [b, pb] = points[j]!;
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < LEVEL_LIMITS.minNodeDistance) at(`nodes ${a} and ${b} are too close`);
    }
  }

  const roads = Array.isArray(data.roads) ? data.roads : null;
  if (!roads) {
    at('roads must be an array');
    return { ok: false, errors };
  }
  const seen = new Set<string>();
  const valid: Array<[string, string]> = [];
  roads.forEach((r: unknown, i) => {
    if (!Array.isArray(r) || r.length !== 2 || typeof r[0] !== 'string' || typeof r[1] !== 'string') {
      at(`road #${i} must be [id, id]`);
      return;
    }
    const [a, b] = r as [string, string];
    if (!byId.has(a) || !byId.has(b)) return at(`road ${a}-${b}: unknown node`);
    if (a === b) return at(`road ${a}-${b}: loop`);
    if (portalLinks.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) {
      return at(`road ${a}-${b}: portals of a pair are linked already`);
    }
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return at(`road ${a}-${b}: duplicate`);
    seen.add(key);
    valid.push([a, b]);
  });

  // Geometry: roads don't cross and don't run over other nodes, so the map reads clearly.
  for (let i = 0; i < valid.length; i++) {
    const [a, b] = valid[i]!;
    const pa = byId.get(a)!;
    const pb = byId.get(b)!;
    for (const [c, pc] of byId) {
      if (c !== a && c !== b && pointSegmentDistance(pc, pa, pb) < LEVEL_LIMITS.roadNodeClearance) {
        at(`road ${a}-${b} runs over node ${c}`);
      }
    }
    for (let j = i + 1; j < valid.length; j++) {
      const [c, d] = valid[j]!;
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsCross(pa, pb, byId.get(c)!, byId.get(d)!)) at(`roads ${a}-${b} and ${c}-${d} cross`);
    }
  }

  // Connectivity over all roads (owners don't matter here).
  if (byId.size > 0) {
    const adjacency = new Map<string, string[]>([...byId.keys()].map((k) => [k, []]));
    for (const [a, b] of [...valid, ...portalLinks]) {
      adjacency.get(a)!.push(b);
      adjacency.get(b)!.push(a);
    }
    const start = byId.keys().next().value!;
    const reached = new Set([start]);
    const stack = [start];
    while (stack.length) {
      for (const next of adjacency.get(stack.pop()!)!) {
        if (!reached.has(next)) {
          reached.add(next);
          stack.push(next);
        }
      }
    }
    for (const nodeId of byId.keys()) if (!reached.has(nodeId)) at(`node ${nodeId} is not connected`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, level: data as unknown as LevelData };
}

interface P {
  x: number;
  y: number;
}

export function pointSegmentDistance(p: P, a: P, b: P): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Proper intersection of segments ab and cd (shared endpoints are handled by the caller). */
export function segmentsCross(a: P, b: P, c: P, d: P): boolean {
  const cross = (o: P, p: P, q: P): number => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
