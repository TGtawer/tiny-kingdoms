import type { Lane, Owner, UnitState, World } from './World';

/**
 * Units on roads (GDD 3.6, ARCHITECTURE.md «Производительность»). Every unit lives in `world.units` (swap-remove)
 * and in the lane of its current segment, ordered head first. Nothing here allocates per tick except new units.
 */

/** Lane of the road (or portal link) from `from` to `to`; -1 if there is none. */
export function laneOf(world: World, from: string, to: string): number {
  return world.laneIndex[`${from}>${to}`] ?? -1;
}

/** Lane index of every segment of `path` (computed once per stream). */
export function pathLanes(world: World, path: readonly string[]): number[] {
  const lanes: number[] = [];
  for (let i = 0; i + 1 < path.length; i++) lanes.push(laneOf(world, path[i]!, path[i + 1]!));
  return lanes;
}

/** The node a unit is heading to: the last node of its path. */
export function unitTarget(unit: UnitState): string {
  return unit.path[unit.path.length - 1]!;
}

/** Puts a unit into a lane, keeping the head-first order (new units almost always go to the tail). */
export function insertIntoLane(lane: Lane, unit: UnitState): void {
  const units = lane.units;
  let i = units.length;
  units.push(unit);
  while (i > 0 && units[i - 1]!.progress < unit.progress) {
    units[i] = units[i - 1]!;
    i--;
  }
  units[i] = unit;
}

/** Creates a unit at `progress` of the first segment of `path`. */
export function spawnUnit(
  world: World,
  owner: Owner,
  path: readonly string[],
  lanes: readonly number[],
  progress: number,
): UnitState {
  const unit: UnitState = { id: world.nextUnitId++, owner, path, lanes, segment: 0, progress, slot: world.units.length };
  world.units.push(unit);
  insertIntoLane(world.lanes[lanes[0]!]!, unit);
  world.incoming[unitTarget(unit)]![owner] += 1;
  return unit;
}

/**
 * Removes a unit from `world.units` (swap-remove) and from the incoming counters. The caller takes it out of its lane
 * (see `compactLane`) — lanes are cleaned once per pass, not per unit.
 */
export function dropUnit(world: World, unit: UnitState): void {
  if (unit.slot < 0) return;
  const units = world.units;
  const last = units.pop()!;
  if (last !== unit) {
    units[unit.slot] = last;
    last.slot = unit.slot;
  }
  unit.slot = -1;
  world.incoming[unitTarget(unit)]![unit.owner] -= 1;
}

/** Removes dropped units (slot -1) from a lane in place. */
export function compactLane(lane: Lane): void {
  const units = lane.units;
  let w = 0;
  for (let r = 0; r < units.length; r++) {
    const u = units[r]!;
    if (u.slot >= 0) units[w++] = u;
  }
  units.length = w;
}

/** Position of a unit in level coordinates. */
export function unitPosition(world: World, unit: UnitState, out: { x: number; y: number }): { x: number; y: number } {
  const lane = world.lanes[unit.lanes[unit.segment]!]!;
  const a = world.nodes[lane.from]!;
  const b = world.nodes[lane.to]!;
  out.x = a.x + (b.x - a.x) * unit.progress;
  out.y = a.y + (b.y - a.y) * unit.progress;
  return out;
}

/** Reached a node this tick: the unit and how far past the node it would have gone. */
export interface Reached {
  unit: UnitState;
  leftover: number;
}

// Scratch list reused between ticks.
const reached: Reached[] = [];
let reachedCount = 0;

/**
 * Moves every unit `distance` along its route. A unit that reaches its target, or a stop that is no longer
 * its own (captured meanwhile), calls `arrive` there and leaves the field; otherwise it goes on to the next segment.
 * Arrivals resolve lane by lane, head first, so the order is deterministic.
 */
export function moveUnits(world: World, distance: number, arrive: (unit: UnitState, nodeId: string) => void): void {
  reachedCount = 0;
  const lanes = world.lanes;
  for (let l = 0; l < lanes.length; l++) {
    const lane = lanes[l]!;
    const units = lane.units;
    if (units.length === 0) continue;
    const dp = distance / lane.length;
    let done = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i]!;
      u.progress += dp;
      if (u.progress >= 1) {
        // Head-first order: everyone who reached the end is at the front of the lane.
        const slot = reached[reachedCount] ?? (reached[reachedCount] = { unit: u, leftover: 0 });
        slot.unit = u;
        slot.leftover = (u.progress - 1) * lane.length;
        reachedCount++;
        done++;
      }
    }
    if (done > 0) {
      units.copyWithin(0, done);
      units.length -= done;
    }
  }

  for (let i = 0; i < reachedCount; i++) {
    const r = reached[i]!;
    advance(world, r.unit, r.leftover, arrive);
  }
}

/** Takes a unit that reached the end of its segment to the next one, or ends its march at that node. */
function advance(world: World, unit: UnitState, leftover: number, arrive: (unit: UnitState, nodeId: string) => void): void {
  let left = leftover;
  for (;;) {
    const at = unit.path[unit.segment + 1]!;
    // Only own nodes are stops on the way (GDD 3.5): if this one was captured, the unit attacks it.
    if (unit.segment + 1 === unit.path.length - 1 || world.nodes[at]!.owner !== unit.owner) {
      arrive(unit, at);
      return;
    }
    unit.segment += 1;
    const lane = world.lanes[unit.lanes[unit.segment]!]!;
    if (left < lane.length) {
      unit.progress = left / lane.length;
      insertIntoLane(lane, unit);
      return;
    }
    // A segment shorter than one step: pass it whole in this tick.
    left -= lane.length;
  }
}
