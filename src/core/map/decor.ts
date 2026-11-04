// Decor placement on the chapter map (docs/VISUALS.md V-2.3). Pure and deterministic: the same seed and
// the same path give the same scenery. Units are whatever the caller uses (screen px of the map world).

export interface DecorKind<K extends string = string> {
  kind: K;
  /** Footprint radius used for spacing. */
  radius: number;
  /** Relative chance to be picked. */
  weight: number;
  /** At most this many of the kind (ponds, mills); unlimited when absent. */
  max?: number;
}

export interface DecorItem<K extends string = string> {
  kind: K;
  x: number;
  y: number;
  radius: number;
  /** 0..1: per-item animation phase and color variant. */
  phase: number;
  tint: number;
}

export interface DecorParams<K extends string = string> {
  seed: number;
  /** Level node centers; the road goes through them in order. */
  path: ReadonlyArray<{ x: number; y: number }>;
  nodeRadius: number;
  /** Free space around nodes (beyond nodeRadius + item radius) and around the road line. */
  nodeClearance: number;
  roadClearance: number;
  /** Gap between two items (beyond their radii). */
  itemGap: number;
  /** Area to fill. */
  area: { x: number; y: number; width: number; height: number };
  kinds: ReadonlyArray<DecorKind<K>>;
  count: number;
  /** Give up after this many random tries. */
  maxTries: number;
}

/** Places up to `count` items, sorted by y (lower items are drawn over upper ones). */
export function placeDecor<K extends string>(p: DecorParams<K>): DecorItem<K>[] {
  const next = rng(p.seed);
  const items: DecorItem<K>[] = [];
  const used = new Map<K, number>();
  const total = p.kinds.reduce((sum, k) => sum + k.weight, 0);
  if (total <= 0 || p.kinds.length === 0) return items;

  for (let tries = 0; items.length < p.count && tries < p.maxTries; tries++) {
    const kind = pick(p.kinds, next() * total);
    const x = p.area.x + next() * p.area.width;
    const y = p.area.y + next() * p.area.height;
    const phase = next();
    const tint = next();
    if (kind.max !== undefined && (used.get(kind.kind) ?? 0) >= kind.max) continue;
    if (!isFree(p, items, x, y, kind.radius)) continue;
    items.push({ kind: kind.kind, x, y, radius: kind.radius, phase, tint });
    used.set(kind.kind, (used.get(kind.kind) ?? 0) + 1);
  }
  return items.sort((a, b) => a.y - b.y);
}

/** Whether a circle of radius `r` at (x, y) keeps clear of nodes, the road and placed items. */
export function isFree<K extends string>(p: DecorParams<K>, items: ReadonlyArray<DecorItem<K>>, x: number, y: number, r: number): boolean {
  for (const n of p.path) if (Math.hypot(n.x - x, n.y - y) < p.nodeRadius + r + p.nodeClearance) return false;
  for (let i = 0; i + 1 < p.path.length; i++) {
    if (distToSegment(x, y, p.path[i]!, p.path[i + 1]!) < r + p.roadClearance) return false;
  }
  for (const d of items) if (Math.hypot(d.x - x, d.y - y) < r + d.radius + p.itemGap) return false;
  return true;
}

export function distToSegment(x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const k = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / len2));
  return Math.hypot(x - a.x - k * dx, y - a.y - k * dy);
}

function pick<K extends string>(kinds: ReadonlyArray<DecorKind<K>>, roll: number): DecorKind<K> {
  let left = roll;
  for (const k of kinds) {
    left -= k.weight;
    if (left <= 0) return k;
  }
  return kinds[kinds.length - 1]!;
}

/** Small LCG, enough for scenery. */
function rng(seed: number): () => number {
  let s = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 8) / 0x1000000;
  };
}
