import type { NodeSize } from '../../config/balance';
import { nextRandom, seedState } from '../sim/rng';
import { LEVEL_LIMITS, pointSegmentDistance, segmentsCross, validateLevel, type EnemyParams, type LevelData, type LevelNode } from './schema';

/**
 * Draft level generator. Produces a point-symmetric map (fair start for both sides),
 * with non-crossing roads that don't run over nodes. Output is a starting point for hand tuning.
 */
export interface GeneratorParams {
  seed: number;
  id: string;
  chapter: number;
  index: number;
  /** Total nodes, including both bases. */
  nodeCount: number;
  enemy: EnemyParams;
  playerStartGold: number;
  baseTroops: number;
  /** Neutral garrison range for a small node; medium ×1.5, large ×2. */
  neutralTroops: [number, number];
  /** Pairs of neutral nodes with a gold vein. */
  goldVeinPairs: number;
  /** Roads ≈ nodeCount × this. */
  roadDensity?: number;
}

const GEN = {
  minSpacing: 0.2,
  minSpacingRelaxed: 0.15,
  maxRoadLength: 0.45,
  maxDegree: 4,
  defaultRoadDensity: 1.3,
  attempts: 30,
  sizeWeights: [
    ['small', 0.5],
    ['medium', 0.35],
    ['large', 0.15],
  ] as Array<[NodeSize, number]>,
  sizeTroopMult: { small: 1, medium: 1.5, large: 2 } as Record<NodeSize, number>,
};

class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seedState(seed);
  }
  next(): number {
    const [v, s] = nextRandom(this.state);
    this.state = s;
    return v;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

interface Draft {
  node: LevelNode;
  mirror: number;
}

export function generateLevel(params: GeneratorParams): LevelData {
  if (params.nodeCount < LEVEL_LIMITS.minNodes || params.nodeCount > LEVEL_LIMITS.maxNodes) {
    throw new Error(`nodeCount must be ${LEVEL_LIMITS.minNodes}..${LEVEL_LIMITS.maxNodes}`);
  }
  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < GEN.attempts; attempt++) {
    const level = tryGenerate(params, new Rng(params.seed * 7919 + attempt));
    if (!level) continue;
    const result = validateLevel(level);
    if (result.ok) return result.level;
    lastErrors = result.errors;
  }
  throw new Error(`could not generate a valid level for seed ${params.seed}: ${lastErrors.join('; ')}`);
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function tryGenerate(params: GeneratorParams, rng: Rng): LevelData | null {
  const drafts: Draft[] = [];
  const add = (node: LevelNode, mirror: LevelNode | null): void => {
    const i = drafts.length;
    if (!mirror) {
      drafts.push({ node, mirror: i });
      return;
    }
    drafts.push({ node, mirror: i + 1 }, { node: mirror, mirror: i });
  };
  const mirrored = (n: LevelNode, id: string): LevelNode => ({
    ...n,
    id,
    x: round(1 - n.x),
    y: round(1 - n.y),
    owner: n.owner === 'player' ? 'enemy' : n.owner,
  });

  // Bases.
  const base: LevelNode = {
    id: 'player',
    x: round(rng.range(0.06, 0.1)),
    y: round(rng.range(0.38, 0.62)),
    size: 'large',
    owner: 'player',
    troops: params.baseTroops,
    hasGoldVein: false,
    building: null,
    capital: true,
  };
  add(base, mirrored(base, 'enemy'));

  // Center node for odd counts (its own mirror).
  if (params.nodeCount % 2 === 1) {
    add(neutral('c', 0.5, 0.5, 'medium', params, rng), null);
  }

  const pairs = Math.floor((params.nodeCount - 2) / 2);
  for (let k = 1; k <= pairs; k++) {
    const point = samplePoint(drafts, rng);
    if (!point) return null;
    const size = pickSize(rng);
    const n = neutral(`a${k}`, point.x, point.y, size, params, rng);
    add(n, mirrored(n, `b${k}`));
  }

  // Gold veins on random neutral pairs.
  const pairIndices = drafts.map((_, i) => i).filter((i) => drafts[i]!.node.id.startsWith('a'));
  for (let v = 0; v < params.goldVeinPairs && pairIndices.length > 0; v++) {
    const pick = pairIndices.splice(rng.int(0, pairIndices.length - 1), 1)[0]!;
    drafts[pick]!.node.hasGoldVein = true;
    drafts[drafts[pick]!.mirror]!.node.hasGoldVein = true;
  }

  const roads = buildRoads(drafts, Math.round(params.nodeCount * (params.roadDensity ?? GEN.defaultRoadDensity)));
  if (!roads) return null;

  return {
    id: params.id,
    chapter: params.chapter,
    index: params.index,
    playerStartGold: params.playerStartGold,
    enemy: { ...params.enemy },
    nodes: drafts.map((d) => d.node),
    roads,
  };
}

function neutral(id: string, x: number, y: number, size: NodeSize, params: GeneratorParams, rng: Rng): LevelNode {
  const [min, max] = params.neutralTroops;
  return {
    id,
    x: round(x),
    y: round(y),
    size,
    owner: 'neutral',
    troops: Math.round(rng.range(min, max) * GEN.sizeTroopMult[size]),
    hasGoldVein: false,
    building: null,
  };
}

function pickSize(rng: Rng): NodeSize {
  let r = rng.next();
  for (const [size, weight] of GEN.sizeWeights) {
    if ((r -= weight) <= 0) return size;
  }
  return 'small';
}

/** A point in the left half, far enough from every node and from its own mirror image. */
function samplePoint(drafts: Draft[], rng: Rng): { x: number; y: number } | null {
  for (const spacing of [GEN.minSpacing, GEN.minSpacingRelaxed]) {
    for (let tries = 0; tries < 300; tries++) {
      const p = { x: rng.range(0.14, 0.5), y: rng.range(0.1, 0.9) };
      const m = { x: 1 - p.x, y: 1 - p.y };
      if (Math.hypot(p.x - m.x, p.y - m.y) < spacing) continue;
      const far = drafts.every(({ node }) => Math.hypot(node.x - p.x, node.y - p.y) >= spacing && Math.hypot(node.x - m.x, node.y - m.y) >= spacing);
      if (far) return p;
    }
  }
  return null;
}

/**
 * Kruskal over symmetric edge pairs (shortest first) for a connected spanning graph,
 * then extra short edges up to the target count. Edges never cross or run over nodes.
 */
function buildRoads(drafts: Draft[], target: number): Array<[string, string]> | null {
  const n = drafts.length;
  const pos = drafts.map((d) => d.node);
  const parent = drafts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const degree = new Array<number>(n).fill(0);
  const edges: Array<[number, number]> = [];
  const key = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const used = new Set<string>();

  const candidates: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const len = Math.hypot(pos[i]!.x - pos[j]!.x, pos[i]!.y - pos[j]!.y);
      if (len <= GEN.maxRoadLength) candidates.push([i, j, len]);
    }
  }
  candidates.sort((a, b) => a[2] - b[2]);

  const fits = (a: number, b: number): boolean => {
    if (a === b || used.has(key(a, b)) || degree[a]! >= GEN.maxDegree || degree[b]! >= GEN.maxDegree) return false;
    for (let c = 0; c < n; c++) {
      if (c !== a && c !== b && pointSegmentDistance(pos[c]!, pos[a]!, pos[b]!) < LEVEL_LIMITS.roadNodeClearance * 1.6) return false;
    }
    return edges.every(([c, d]) => a === c || a === d || b === c || b === d || !segmentsCross(pos[a]!, pos[b]!, pos[c]!, pos[d]!));
  };
  const addPair = (a: number, b: number, requireJoin: boolean): boolean => {
    const ma = drafts[a]!.mirror;
    const mb = drafts[b]!.mirror;
    const self = key(a, b) === key(ma, mb);
    if (requireJoin && find(a) === find(b)) return false;
    if (!fits(a, b)) return false;
    edges.push([a, b]);
    used.add(key(a, b));
    degree[a]!++;
    degree[b]!++;
    if (!self) {
      if (!fits(ma, mb)) {
        // Keep the map symmetric: undo.
        edges.pop();
        used.delete(key(a, b));
        degree[a]!--;
        degree[b]!--;
        return false;
      }
      edges.push([ma, mb]);
      used.add(key(ma, mb));
      degree[ma]!++;
      degree[mb]!++;
    }
    parent[find(a)] = find(b);
    parent[find(ma)] = find(mb);
    return true;
  };

  for (const [a, b] of candidates) addPair(a, b, true);
  const root = find(0);
  if (drafts.some((_, i) => find(i) !== root)) return null;
  for (const [a, b] of candidates) {
    if (edges.length >= target) break;
    addPair(a, b, false);
  }
  return edges.map(([a, b]) => [pos[a]!.id, pos[b]!.id]);
}
