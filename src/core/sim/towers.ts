import { BUILDINGS } from '../../config/balance';
import { towerRate, towerShoots } from './combat';
import { compactLane, dropUnit } from './units';
import { nowMs, type Owner, type World } from './World';

/** Below this, a distance counts as zero (float noise). */
const EPSILON = 1e-9;

/** A tower shot a unit on one of its roads (docs/TOWER.md). */
export interface TowerShot {
  /** The tower's node. */
  nodeId: string;
  /** The unit shot and its side. */
  unitId: number;
  owner: Owner;
  /** Where it was: its lane (heading to the tower's node) and progress along it at the shot. */
  lane: number;
  progress: number;
}

/**
 * Tower shots of one tick (docs/TOWER.md), after the road clashes and before movement. A tower covers the start of
 * every road of its node (`world.roadsInto`: portal links are not covered) up to BUILDINGS.tower.zone from the node
 * center. With a shot ready it kills the hostile unit nearest to the node among those in the zone: in a lane the
 * units go head first, so only the first hostile one of each lane can be the nearest. Hostile = any side but the
 * node's owner (a neutral tower shoots everyone but neutrals); own units are skipped. A shield on the node doesn't
 * stop the tower. A shot is not an attack on the node (no `attackedUntilMs`): only units that reach it attack it.
 * At most one shot per tower per tick; the reload is `towerShoots`'s. No allocations except the results.
 */
export function fireTowers(world: World, out: TowerShot[]): void {
  const now = nowMs(world);
  const zone = BUILDINGS.tower.zone + EPSILON;
  for (const nodeId in world.nodes) {
    const node = world.nodes[nodeId]!;
    if (node.towerReadyAtMs > now || towerRate(node) <= 0) continue;
    const lanes = world.roadsInto[nodeId]!;
    let bestLane = -1;
    let bestIndex = -1;
    let bestDist = Infinity;
    for (let k = 0; k < lanes.length; k++) {
      const laneIdx = lanes[k]!;
      const units = world.lanes[laneIdx]!.units;
      const length = world.lanes[laneIdx]!.length;
      for (let i = 0; i < units.length; i++) {
        const unit = units[i]!;
        if (unit.slot < 0 || unit.owner === node.owner) continue;
        const dist = (1 - unit.progress) * length;
        if (dist <= zone && dist < bestDist) {
          bestDist = dist;
          bestLane = laneIdx;
          bestIndex = i;
        }
        // The units behind are farther from the node.
        break;
      }
    }
    if (bestLane < 0 || !towerShoots(world, node)) continue;
    const lane = world.lanes[bestLane]!;
    const unit = lane.units[bestIndex]!;
    out.push({ nodeId, unitId: unit.id, owner: unit.owner, lane: bestLane, progress: unit.progress });
    dropUnit(world, unit);
    compactLane(lane);
  }
}
