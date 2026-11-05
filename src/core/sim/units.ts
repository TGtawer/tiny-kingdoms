import type { Lane, Owner, Route, UnitState, World } from './World';

/**
 * Units on roads (GDD 3.6, ARCHITECTURE.md «Производительность»). Every unit lives in `world.units` (swap-remove)
 * and in the lane of its road, ordered head first. A unit walks one road only: at its end it arrives at the target
 * or goes into transit in an own node (stream.ts). Nothing here allocates per tick except new units.
 */

/** Lane of the road (or portal link) from `from` to `to`; -1 if there is none. */
export function laneOf(world: World, from: string, to: string): number {
  return world.laneIndex[`${from}>${to}`] ?? -1;
}

/** The route of an order along `path`, with every suffix built once (shared by all units and transit streams). */
export function buildRoute(world: World, path: readonly string[]): Route {
  let next: Route | null = null;
  for (let i = path.length - 2; i >= 0; i--) {
    const rest = path.slice(i);
    const lanes: number[] = [];
    for (let k = 0; k + 1 < rest.length; k++) lanes.push(laneOf(world, rest[k]!, rest[k + 1]!));
    next = { path: rest, lanes, next };
  }
  return next!;
}

/** The node a unit (or a stream) is finally heading to. */
export function routeTarget(route: Route): string {
  return route.path[route.path.length - 1]!;
}

export function unitTarget(unit: UnitState): string {
  return routeTarget(unit.route);
}

/** The unit's road. */
export function unitLane(world: World, unit: UnitState): Lane {
  return world.lanes[unit.route.lanes[0]!]!;
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

/** Creates a unit on the first road of `route` at `progress` (by default where units appear on it). */
export function spawnUnit(world: World, owner: Owner, route: Route, progress?: number): UnitState {
  const lane = world.lanes[route.lanes[0]!]!;
  const unit: UnitState = { id: world.nextUnitId++, owner, route, progress: progress ?? lane.startP, slot: world.units.length };
  world.units.push(unit);
  insertIntoLane(lane, unit);
  world.incoming[routeTarget(route)]![owner] += 1;
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

/** Position of a unit in level coordinates (on the straight line between the node centers). */
export function unitPosition(world: World, unit: UnitState, out: { x: number; y: number }): { x: number; y: number } {
  const lane = unitLane(world, unit);
  const a = world.nodes[lane.from]!;
  const b = world.nodes[lane.to]!;
  out.x = a.x + (b.x - a.x) * unit.progress;
  out.y = a.y + (b.y - a.y) * unit.progress;
  return out;
}

// Scratch list reused between ticks.
const reached: UnitState[] = [];

/**
 * Moves every unit `distance` along its road. A unit that reaches the far end (lane.endP: the edge of the node's
 * circle) is taken off the road and handed to `arrive` with the node it reached. Arrivals resolve lane by lane,
 * head first, so the order is deterministic.
 */
export function moveUnits(world: World, distance: number, arrive: (unit: UnitState, nodeId: string) => void): void {
  reached.length = 0;
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
      // Head-first order: everyone who reached the end is at the front of the lane. The epsilon absorbs float sums
      // (ten steps of 0.1 are 0.9999999999999999).
      if (u.progress >= lane.endP - 1e-9) {
        reached.push(u);
        done++;
      }
    }
    if (done > 0) {
      units.copyWithin(0, done);
      units.length -= done;
    }
  }
  for (let i = 0; i < reached.length; i++) {
    const u = reached[i]!;
    arrive(u, u.route.path[1]!);
  }
}
