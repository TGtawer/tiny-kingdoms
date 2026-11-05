import { STREAM } from '../../config/balance';
import { compactLane, dropUnit } from './units';
import type { Owner, UnitState, World } from './World';

/** Below this, a gap counts as zero (float noise). */
const EPSILON = 1e-9;

/** Two units of different sides touched and destroyed each other (GDD 3.6). */
export interface ClashResult {
  /** Owners of the two units (the one moving along the road's a -> b first). */
  owners: [Owner, Owner];
  /** Meeting point in level coordinates. */
  x: number;
  y: number;
  /** The same point as the road (its a -> b lane) and progress along it, for views that draw roads between circles. */
  lane: number;
  progress: number;
}

/**
 * One side of a road for the clash pass: the units of a lane with `pos` = distance from the road's `a` end, ordered
 * from the lane head (front of the column) to its tail.
 */
interface Column {
  units: UnitState[];
  pos: number[];
  count: number;
}

function column(): Column {
  return { units: [], pos: [], count: 0 };
}

// Scratch columns and the list of lanes with dead units, reused between ticks.
const forward = column();
const backward = column();
const dirty: number[] = [];

function fill(world: World, c: Column, laneIdx: number, fromA: boolean): void {
  const lane = world.lanes[laneIdx]!;
  const len = lane.length;
  const units = lane.units;
  for (let i = 0; i < units.length; i++) {
    const along = units[i]!.progress * len;
    c.units[i] = units[i]!;
    c.pos[i] = fromA ? along : len - along;
  }
  c.count = units.length;
}

function markDirty(lane: number): void {
  for (let i = 0; i < dirty.length; i++) if (dirty[i] === lane) return;
  dirty.push(lane);
}

/**
 * Units of different sides moving towards each other on one road destroy each other 1:1 when they touch
 * (GDD 3.6). Called before movement, swept: a pair touches this tick if
 * its gap is at most 2 × stepDistance + STREAM.contactDist. Same-side units pass through each other;
 * units moving the same way never meet (one speed).
 *
 * Cost is O(units on the road): both columns are walked once from their fronts (a sliding window), no pair loops.
 */
export function resolveClashes(world: World, stepDistance: number, out: ClashResult[]): void {
  const reach = 2 * stepDistance + STREAM.contactDist;
  dirty.length = 0;
  const lanes = world.lanes;
  for (let l = 0; l < lanes.length; l += 2) {
    const ab = lanes[l]!;
    const ba = lanes[l + 1]!;
    if (ab.portal || ab.units.length === 0 || ba.units.length === 0) continue;
    fill(world, forward, l, true);
    fill(world, backward, l + 1, false);
    clashRoad(world, l, reach, out);
  }
  for (let i = 0; i < dirty.length; i++) compactLane(lanes[dirty[i]!]!);
}

/**
 * Forward units go a -> b with positions descending from their front; backward units go b -> a with positions
 * ascending from their front. For each forward unit (front first) the candidates are the backward units with
 * position in [pos - ε, pos + reach]; that window only moves towards the backward front, so a pointer walks it once.
 */
function clashRoad(world: World, abIdx: number, window: number, out: ClashResult[]): void {
  const ab = world.lanes[abIdx]!;
  const a = world.nodes[ab.from]!;
  const b = world.nodes[ab.to]!;
  const len = ab.length;
  // `hi`: last backward index whose position is within the window's upper bound.
  let hi = backward.count - 1;
  for (let i = 0; i < forward.count; i++) {
    const u = forward.units[i]!;
    if (u.slot < 0) continue;
    const x = forward.pos[i]!;
    while (hi >= 0 && backward.pos[hi]! > x + window + EPSILON) hi--;
    if (hi < 0) return;
    // Nearest live backward unit of another side ahead of u: scan down from hi while still in front of u.
    let pick = -1;
    for (let j = hi; j >= 0 && backward.pos[j]! >= x - EPSILON; j--) {
      const v = backward.units[j]!;
      if (v.slot >= 0 && v.owner !== u.owner) pick = j;
    }
    if (pick < 0) continue;
    const v = backward.units[pick]!;
    const t = len > 0 ? Math.min(1, Math.max(0, (x + backward.pos[pick]!) / 2 / len)) : 0;
    out.push({ owners: [u.owner, v.owner], x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, lane: abIdx, progress: t });
    dropUnit(world, u);
    dropUnit(world, v);
    markDirty(abIdx);
    markDirty(ab.reverse);
  }
}
