import { ARMY, STREAM, TICK_MS } from '../../config/balance';
import { visibleTroops } from './troops';
import { buildRoute, routeTarget, spawnUnit } from './units';
import { isAttacked, type Owner, type Route, type StreamState, type World } from './World';

/**
 * Streams (GDD 3.6): units waiting in a node to leave along a route. The column step is a property of the road:
 * a unit enters a lane only when the unit that entered it before has walked a full step (ARMY.speed /
 * releasePerSec) away from the entry, so no mix of swipes, transit and waves ever makes a column denser than one
 * stream. Streams of one node that want the same lane take turns; different lanes are independent.
 */

/** Column step, field units. */
export const COLUMN_STEP = ARMY.speed / (STREAM.releasePerSec * STREAM.width);
/** Distance a unit walks in one tick, field units. */
const TICK_STEP = (ARMY.speed * TICK_MS) / 1000;
const EPSILON = 1e-9;

function setStreamCount(world: World, stream: StreamState, delta: number): void {
  if (stream.extra) return;
  const node = world.nodes[stream.sourceId];
  if (node) node.streams += delta;
}

function createStream(
  world: World,
  owner: Owner,
  sourceId: string,
  route: Route,
  count: number,
  extra: boolean,
  transit = false,
): StreamState {
  const stream: StreamState = { id: world.nextStreamId++, sourceId, owner, route, left: count, lastReleaseTick: -1, extra, transit };
  world.streams.push(stream);
  setStreamCount(world, stream, 1);
  return stream;
}

/** Removes the streams matching `drop` (keeps the order of the others). */
function removeStreams(world: World, drop: (s: StreamState) => boolean): void {
  const list = world.streams;
  let w = 0;
  for (let r = 0; r < list.length; r++) {
    const s = list[r]!;
    if (drop(s)) setStreamCount(world, s, -1);
    else list[w++] = s;
  }
  list.length = w;
}

/**
 * Stops everything leaving `nodeId` (its own order and transit forwarding; citadel waves go on): the units that
 * haven't left stay in the garrison. Units already on the road march on.
 */
export function cancelNodeStreams(world: World, nodeId: string): void {
  removeStreams(world, (s) => s.sourceId === nodeId && !s.extra);
}

/** The node changed hands: the streams of its old owner break off (their units died with the garrison). */
export function dropForeignStreams(world: World, nodeId: string): void {
  const owner = world.nodes[nodeId]!.owner;
  removeStreams(world, (s) => s.sourceId === nodeId && s.owner !== owner);
}

/**
 * Orders `count` units from `sourceId` along `path` (GDD 3.6). A re-swipe: everything the node was releasing is
 * cancelled first (the rest stays home). `extra` streams (citadel waves) release units on top of the garrison.
 * The first unit leaves in this tick if the road's entry is free.
 */
export function startStream(
  world: World,
  owner: Owner,
  sourceId: string,
  path: readonly string[],
  count: number,
  extra = false,
): StreamState {
  if (!extra) cancelNodeStreams(world, sourceId);
  return createStream(world, owner, sourceId, buildRoute(world, path), count, extra);
}

/**
 * A unit reached an own node on its way (GDD 3.6, transit): it joins the garrison and the node sends it on along
 * the rest of the route — one more unit in the node's stream for that route, or a new stream. An attacked node
 * keeps it (like any interrupted stream).
 */
export function enterTransit(world: World, owner: Owner, nodeId: string, rest: Route): void {
  const node = world.nodes[nodeId]!;
  node.troops += 1;
  if (isAttacked(world, node)) return;
  for (const s of world.streams) {
    if (s.sourceId === nodeId && s.route === rest && s.transit && s.owner === owner) {
      s.left += 1;
      return;
    }
  }
  createStream(world, owner, nodeId, rest, 1, false, true);
}

// Per-lane choice of the stream that releases this tick (index into world.streams), reused between ticks.
const laneBest: number[] = [];
const touched: number[] = [];

/**
 * Releases units for this tick (after movement). Streams end when everything left, when the source is attacked
 * (the rest stays home; nothing resumes by itself) or when the source changed hands (the rest died with the
 * garrison). At least one troop always stays in the source. One unit per lane per tick at most.
 */
export function releaseStreams(world: World): void {
  const list = world.streams;
  // 1. Drop streams that can't go on.
  removeStreams(world, (s) => {
    const source = world.nodes[s.sourceId]!;
    return s.left <= 0 || source.owner !== s.owner || isAttacked(world, source);
  });

  // 2. For every lane, the stream that waited longest (ties: the older stream).
  for (let i = laneBest.length; i < world.lanes.length; i++) laneBest.push(-1);
  touched.length = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    const lane = s.route.lanes[0]!;
    const best = laneBest[lane]!;
    if (best < 0) {
      laneBest[lane] = i;
      touched.push(lane);
    } else if (s.lastReleaseTick < list[best]!.lastReleaseTick) {
      laneBest[lane] = i;
    }
  }

  // 3. Each chosen stream releases one unit if its road's entry is free.
  for (let k = 0; k < touched.length; k++) {
    const laneIdx = touched[k]!;
    const s = list[laneBest[laneIdx]!]!;
    laneBest[laneIdx] = -1;
    const lane = world.lanes[laneIdx]!;
    const stepP = COLUMN_STEP / lane.length;
    const units = lane.units;
    const tail = units.length > 0 ? units[units.length - 1]! : null;
    if (tail && tail.progress - stepP < lane.startP - EPSILON) continue;
    if (!s.extra) {
      const source = world.nodes[s.sourceId]!;
      // Spells or bosses may have thinned the garrison meanwhile: a swipe never empties the node; units in transit
      // only need to still be there.
      if (visibleTroops(source.troops) < (s.transit ? 1 : ARMY.minTroopsToSend)) {
        s.left = 0;
        continue;
      }
      source.troops -= 1;
    }
    // Exactly one step behind the tail (it may have passed the step during this tick), else at the entry.
    const at = tail ? Math.min(Math.max(tail.progress - stepP, lane.startP), lane.startP + TICK_STEP / lane.length) : lane.startP;
    spawnUnit(world, s.owner, s.route, at);
    world.nodes[s.sourceId]!.released += 1;
    s.left -= 1;
    s.lastReleaseTick = world.tick;
  }

  // 4. Finished streams leave the list.
  removeStreams(world, (s) => s.left <= 0);
}

/** Units still to leave in streams of `owner` heading to `targetId`. */
export function pendingTo(world: World, targetId: string, owner: Owner): number {
  let n = 0;
  for (const s of world.streams) if (s.owner === owner && routeTarget(s.route) === targetId) n += s.left;
  return n;
}
