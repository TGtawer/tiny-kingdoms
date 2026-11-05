import { STREAM } from '../../config/balance';
import { compactLane, dropUnit } from './units';
import type { Lane, Owner, UnitState, World } from './World';

/** Below this, a gap counts as zero (float noise). */
const EPSILON = 1e-9;

/** Two units of different sides touched and destroyed each other (GDD 3.6). */
export interface ClashResult {
  /** Owners of the two units (the one moving along the road's a -> b first). */
  owners: [Owner, Owner];
  /** Meeting point in level coordinates. */
  x: number;
  y: number;
}

/**
 * One side of a road for the clash pass: the units of a lane plus the units about to enter it from its start node
 * this tick (they pass through an own node; their position is before the road start). `pos` is the distance from
 * the road's `a` end; entries are ordered from the lane head (front of the column) to its tail.
 */
interface Column {
  units: UnitState[];
  pos: number[];
  /** Lane each unit is in (differs from the road's lane for units about to enter). */
  lane: number[];
  count: number;
}

function column(): Column {
  return { units: [], pos: [], lane: [], count: 0 };
}

/**
 * Appends a unit, keeping the column front first: positions descending (`desc`, a -> b) or ascending (b -> a).
 * Lane units arrive already ordered; only units entering from the fork may need a step or two back.
 */
function push(c: Column, unit: UnitState, pos: number, lane: number, desc: boolean): void {
  let i = c.count++;
  while (i > 0 && (desc ? c.pos[i - 1]! < pos : c.pos[i - 1]! > pos)) {
    c.units[i] = c.units[i - 1]!;
    c.pos[i] = c.pos[i - 1]!;
    c.lane[i] = c.lane[i - 1]!;
    i--;
  }
  c.units[i] = unit;
  c.pos[i] = pos;
  c.lane[i] = lane;
}

// Scratch columns and the list of lanes with dead units, reused between ticks.
const forward = column();
const backward = column();
const dirty: number[] = [];

/**
 * Fills `c` with the units of lane `laneIdx` (head first), then the units that enter it from its start node this
 * tick: heads of lanes into that node within `reach` of it, whose next segment is this lane.
 */
function fill(world: World, c: Column, laneIdx: number, fromA: boolean, reach: number): void {
  c.count = 0;
  const lane = world.lanes[laneIdx]!;
  const len = lane.length;
  const units = lane.units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    const along = u.progress * len;
    push(c, u, fromA ? along : len - along, laneIdx, fromA);
  }
  const into = world.lanesInto[lane.from]!;
  const node = world.nodes[lane.from]!;
  for (let k = 0; k < into.length; k++) {
    const other = world.lanes[into[k]!]!;
    if (other.portal || into[k] === lane.reverse) continue;
    const list = other.units;
    for (let i = 0; i < list.length; i++) {
      const u = list[i]!;
      const remaining = (1 - u.progress) * other.length;
      if (remaining > reach) break;
      // Passing through an own node onto this road (not ending its march there).
      if (u.segment + 2 >= u.path.length || u.lanes[u.segment + 1] !== laneIdx || node.owner !== u.owner) continue;
      push(c, u, fromA ? -remaining : len + remaining, into[k]!, fromA);
    }
  }
}

function markDirty(lane: number): void {
  for (let i = 0; i < dirty.length; i++) if (dirty[i] === lane) return;
  dirty.push(lane);
}

/**
 * Units of different sides moving towards each other on one road destroy each other 1:1 when they touch
 * (GDD 3.6): on the road and at the fork by a node. Called before movement, swept: a pair touches this tick if
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
    if (ab.portal) continue;
    // Somebody must move each way (lanes or units about to enter them).
    if (ab.units.length === 0 && ba.units.length === 0) continue;
    fill(world, forward, l, true, reach);
    if (forward.count === 0) continue;
    fill(world, backward, l + 1, false, reach);
    if (backward.count === 0) continue;
    clashRoad(world, ab, reach, out);
  }
  for (let i = 0; i < dirty.length; i++) compactLane(lanes[dirty[i]!]!);
}

/**
 * Forward units go a -> b with positions descending from their front; backward units go b -> a with positions
 * ascending from their front. For each forward unit (front first) the candidates are the backward units with
 * position in [pos - ε, pos + reach]; that window only moves towards the backward front, so a pointer walks it once.
 */
function clashRoad(world: World, ab: Lane, window: number, out: ClashResult[]): void {
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
    out.push({ owners: [u.owner, v.owner], x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    dropUnit(world, u);
    dropUnit(world, v);
    markDirty(forward.lane[i]!);
    markDirty(backward.lane[pick]!);
  }
}
