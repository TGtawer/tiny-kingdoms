import { ARMY, STREAM } from '../../config/balance';
import { visibleTroops } from './troops';
import { pathLanes, spawnUnit } from './units';
import { isAttacked, type Owner, type StreamState, type World } from './World';

/** Remove a stream from the list (keeps the order of the others). */
function removeStream(world: World, id: number): void {
  const list = world.streams;
  let w = 0;
  for (let r = 0; r < list.length; r++) {
    const s = list[r]!;
    if (s.id !== id) list[w++] = s;
  }
  list.length = w;
}

export function findStream(world: World, id: number | null): StreamState | null {
  if (id === null) return null;
  for (const s of world.streams) if (s.id === id) return s;
  return null;
}

/**
 * Stops a stream: the units that haven't left stay in the garrison (they were never taken out of it).
 * Units already on the road march on.
 */
export function cancelStream(world: World, stream: StreamState): void {
  removeStream(world, stream.id);
  const source = world.nodes[stream.sourceId];
  if (source && source.streamId === stream.id) source.streamId = null;
}

/**
 * Orders `count` units from `sourceId` along `path` (GDD 3.6). The node's previous stream, if any, is cancelled
 * (re-swipe). `extra` streams (citadel waves) release units on top of the garrison and leave the node's slot free.
 * The first unit leaves in this tick.
 */
export function startStream(
  world: World,
  owner: Owner,
  sourceId: string,
  path: readonly string[],
  count: number,
  extra = false,
): StreamState {
  const source = world.nodes[sourceId]!;
  if (!extra) {
    const old = findStream(world, source.streamId);
    if (old) cancelStream(world, old);
  }
  const stream: StreamState = {
    id: world.nextStreamId++,
    sourceId,
    owner,
    path,
    lanes: pathLanes(world, path),
    left: count,
    // A full unit is ready at once: the column starts moving on the order's tick.
    releaseAcc: 1,
    extra,
  };
  world.streams.push(stream);
  if (!extra) source.streamId = stream.id;
  return stream;
}

/**
 * Releases units of every stream for one step of `dtSec` (after movement). A stream ends when everything left,
 * when its source is attacked (the rest stays home, nothing resumes by itself), or when the source changed hands
 * (the rest died with the garrison). At least one troop always stays in the source.
 *
 * Units released in this step get the distance they would have walked since their release moment inside the step,
 * so the spacing in the column is exactly ARMY.speed / releasePerSec.
 */
export function releaseStreams(world: World, dtSec: number): void {
  const rate = STREAM.releasePerSec * STREAM.width;
  const list = world.streams;
  let w = 0;
  for (let r = 0; r < list.length; r++) {
    const s = list[r]!;
    const source = world.nodes[s.sourceId]!;
    let alive = source.owner === s.owner && (s.extra || source.streamId === s.id) && !isAttacked(world, source);

    if (alive) {
      const acc0 = s.releaseAcc;
      const total = acc0 + rate * dtSec;
      let k = 1;
      while (k <= total + 1e-9 && s.left > 0) {
        if (!s.extra) {
          // Spells or bosses may have thinned the garrison meanwhile: never empty the node.
          if (visibleTroops(source.troops) < ARMY.minTroopsToSend) {
            s.left = 0;
            break;
          }
          source.troops -= 1;
        }
        const sinceRelease = dtSec - Math.max(0, k - acc0) / rate;
        const lane = world.lanes[s.lanes[0]!]!;
        spawnUnit(world, s.owner, s.path, s.lanes, Math.max(0, (ARMY.speed * sinceRelease) / lane.length));
        s.left -= 1;
        k++;
      }
      s.releaseAcc = total - (k - 1);
      if (s.left <= 0) alive = false;
    }

    if (alive) {
      list[w++] = s;
    } else if (source.streamId === s.id) {
      source.streamId = null;
    }
  }
  list.length = w;
}

/** Units still to leave in streams of `owner` heading to `targetId`. */
export function pendingTo(world: World, targetId: string, owner: Owner): number {
  let n = 0;
  for (const s of world.streams) if (s.owner === owner && s.path[s.path.length - 1] === targetId) n += s.left;
  return n;
}
