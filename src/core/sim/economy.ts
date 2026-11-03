import { BUILDINGS, NODES } from '../../config/balance';
import type { NodeState, SideModifiers, World } from './World';

/** Max troops a node produces up to (base + barracks). */
export function nodeCapacity(node: NodeState): number {
  const base = NODES[node.size].capacity;
  if (node.building?.type === 'barracks') {
    return base + BUILDINGS.barracks.extraCapacity[node.building.level - 1]!;
  }
  return base;
}

/** Troops per second. Neutral nodes do not produce. */
export function troopRate(node: NodeState, modifiers: SideModifiers): number {
  if (node.owner === 'neutral') return 0;
  let rate = NODES[node.size].troopsPerSec;
  if (node.building?.type === 'barracks') {
    rate *= BUILDINGS.barracks.productionMult[node.building.level - 1]!;
  }
  return rate * modifiers.troopProductionMult;
}

/** Gold per second. Neutral nodes do not produce. */
export function goldRate(node: NodeState, modifiers: SideModifiers): number {
  if (node.owner === 'neutral') return 0;
  let rate = NODES[node.size].goldPerSec;
  if (node.building?.type === 'mine' && node.hasGoldVein) {
    rate += BUILDINGS.mine.extraGoldPerSec[node.building.level - 1]!;
  }
  return rate * modifiers.goldIncomeMult;
}

/** Produces troops (stopping at capacity, never reducing an overfilled node) and gold. */
export function produce(world: World, dtSec: number): void {
  for (const node of Object.values(world.nodes)) {
    if (node.owner === 'neutral') continue;
    const side = world.sides[node.owner];

    const capacity = nodeCapacity(node);
    if (node.troops < capacity) {
      node.troops = Math.min(capacity, node.troops + troopRate(node, side.modifiers) * dtSec);
    }
    side.gold += goldRate(node, side.modifiers) * dtSec;
  }
}
