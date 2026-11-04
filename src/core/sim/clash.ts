import { resolveBattle } from './combat';
import { distance, isPortalLink } from './pathfinding';
import { strengthOf, type ArmyState, type World } from './World';

/** Below this, a remainder counts as zero. */
const EPSILON = 1e-9;

export interface ClashResult {
  /** Army ids in creation order. */
  armies: [string, string];
  /** Surviving army id, or null if both were destroyed. */
  survivorId: string | null;
  /** Meeting point in level coordinates. */
  x: number;
  y: number;
}

interface OnRoad {
  army: ArmyState;
  /** Canonical road key "a|b" with a < b. */
  road: string;
  /** Distance from the road's first endpoint (a). */
  at: number;
  /** +1 moving a → b, -1 moving b → a. */
  dir: 1 | -1;
  length: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

function onRoad(world: World, army: ArmyState): OnRoad | null {
  const from = army.path[army.segment];
  const to = army.path[army.segment + 1];
  if (from === undefined || to === undefined) return null;
  // Inside a portal there is no road to meet on.
  if (isPortalLink(world, from, to)) return null;
  const [a, b] = from < to ? [from, to] : [to, from];
  const na = world.nodes[a]!;
  const nb = world.nodes[b]!;
  const length = distance(na, nb);
  const travelled = army.progress * length;
  const forward = from === a;
  return {
    army,
    road: `${a}|${b}`,
    at: forward ? travelled : length - travelled,
    dir: forward ? 1 : -1,
    length,
    ax: na.x,
    ay: na.y,
    bx: nb.x,
    by: nb.y,
  };
}

/**
 * Head-on clashes between armies of opposite sides on the same road (GDD 3.6).
 * Called before movement: two armies clash if they would meet during this tick (`stepDistance` each).
 * The stronger army survives and loses as many troops as the weaker one had (scaled by unit strength).
 * Same-side armies pass through each other; armies moving the same way never meet (equal speed).
 */
export function resolveClashes(world: World, stepDistance: number): ClashResult[] {
  const byRoad = new Map<string, OnRoad[]>();
  for (const army of world.armies) {
    const r = onRoad(world, army);
    if (!r) continue;
    const list = byRoad.get(r.road);
    if (list) list.push(r);
    else byRoad.set(r.road, [r]);
  }

  // Candidate pairs: opposite sides, facing each other, close enough to meet this tick.
  const pairs: Array<{ fwd: OnRoad; back: OnRoad; gap: number }> = [];
  for (const list of byRoad.values()) {
    for (const fwd of list) {
      if (fwd.dir !== 1) continue;
      for (const back of list) {
        if (back.dir !== -1 || back.army.owner === fwd.army.owner) continue;
        const gap = back.at - fwd.at;
        if (gap >= -EPSILON && gap <= 2 * stepDistance + EPSILON) pairs.push({ fwd, back, gap });
      }
    }
  }
  // Closest meetings first; ties by army creation order, so the result is deterministic.
  const order = new Map(world.armies.map((a, i) => [a.id, i]));
  pairs.sort(
    (p, q) =>
      p.gap - q.gap ||
      Math.min(order.get(p.fwd.army.id)!, order.get(p.back.army.id)!) -
        Math.min(order.get(q.fwd.army.id)!, order.get(q.back.army.id)!),
  );

  const dead = new Set<string>();
  const results: ClashResult[] = [];
  for (const { fwd, back } of pairs) {
    const a = fwd.army;
    const b = back.army;
    if (dead.has(a.id) || dead.has(b.id)) continue;

    const strengthA = strengthOf(world, a.owner);
    const strengthB = strengthOf(world, b.owner);
    const { attackersLeft, defendersLeft } = resolveBattle(a.count, strengthA, b.count, strengthB);
    a.count = attackersLeft;
    b.count = defendersLeft;
    if (a.count <= EPSILON) dead.add(a.id);
    if (b.count <= EPSILON) dead.add(b.id);

    const t = fwd.length > 0 ? Math.min(1, Math.max(0, (fwd.at + back.at) / 2 / fwd.length)) : 0;
    const [first, second] = order.get(a.id)! < order.get(b.id)! ? [a.id, b.id] : [b.id, a.id];
    results.push({
      armies: [first, second],
      survivorId: dead.has(a.id) ? (dead.has(b.id) ? null : b.id) : a.id,
      x: fwd.ax + (fwd.bx - fwd.ax) * t,
      y: fwd.ay + (fwd.by - fwd.ay) * t,
    });
  }

  if (dead.size > 0) world.armies = world.armies.filter((a) => !dead.has(a.id));
  return results;
}
