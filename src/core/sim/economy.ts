import { BUILDINGS, NODES, SPECIAL_NODES, STREAM } from '../../config/balance';
import { isAttacked, type NodeState, type Side, type SideModifiers, type World } from './World';

/** Max troops a node produces up to (base + barracks). */
export function nodeCapacity(node: NodeState): number {
  // Bandit camps produce like a small node.
  const base = NODES[node.kind === 'bandits' ? 'small' : node.size].capacity;
  if (node.building?.type === 'barracks') {
    return base + BUILDINGS.barracks.extraCapacity[node.building.level - 1]!;
  }
  return base;
}

/** Troops per second. Neutral nodes and temples do not produce; bandit camps do (as a small node). */
export function troopRate(node: NodeState, modifiers: SideModifiers): number {
  if (node.kind === 'temple') return 0;
  if (node.owner === 'neutral') return node.kind === 'bandits' ? NODES.small.troopsPerSec : 0;
  let rate = NODES[node.size].troopsPerSec;
  if (node.building?.type === 'barracks') {
    rate *= BUILDINGS.barracks.productionMult[node.building.level - 1]!;
  }
  return rate * modifiers.troopProductionMult;
}

/** Gold per second of one node, before the temple bonus. Neutral nodes and temples do not produce. */
export function goldRate(node: NodeState, modifiers: SideModifiers): number {
  if (node.owner === 'neutral' || node.kind === 'temple') return 0;
  let rate = NODES[node.size].goldPerSec;
  if (node.building?.type === 'mine' && node.hasGoldVein) {
    rate += BUILDINGS.mine.extraGoldPerSec[node.building.level - 1]!;
  }
  return rate * modifiers.goldIncomeMult;
}

/** Multiplier of a side's whole gold income from the temples it holds. */
export function templeIncomeMult(world: World, side: Side): number {
  const temples = Object.values(world.nodes).filter((n) => n.owner === side && n.kind === 'temple').length;
  return 1 + temples * SPECIAL_NODES.temple.goldBonus;
}

/** Total gold per second of a side (all its nodes, mines and temples included). */
export function sideGoldRate(world: World, side: Side): number {
  const modifiers = world.sides[side].modifiers;
  let total = 0;
  for (const node of Object.values(world.nodes)) {
    if (node.owner === side) total += goldRate(node, modifiers);
  }
  return total * templeIncomeMult(world, side);
}

/**
 * Whether the node's troop production is stopped (GDD 3.3, 3.6): while it is attacked, and — only with the
 * STREAM.pauseSourceProduction balance lever — while it releases a stream. Gold is not affected.
 */
export function productionPaused(world: World, node: NodeState): boolean {
  return isAttacked(world, node) || (STREAM.pauseSourceProduction && node.streams > 0);
}

/** Produces troops (stopping at capacity, never reducing an overfilled node, not while paused) and gold. */
export function produce(world: World, dtSec: number): void {
  const incomeMult = {
    player: templeIncomeMult(world, 'player'),
    enemy: templeIncomeMult(world, 'enemy'),
    enemy2: templeIncomeMult(world, 'enemy2'),
  };
  for (const node of Object.values(world.nodes)) {
    if (node.owner === 'neutral') {
      // Bandit camps grow their garrison; other neutrals don't produce.
      if (node.kind === 'bandits' && node.troops < nodeCapacity(node) && !productionPaused(world, node)) {
        node.troops = Math.min(nodeCapacity(node), node.troops + NODES.small.troopsPerSec * dtSec);
      }
      continue;
    }
    const side = world.sides[node.owner];

    const capacity = nodeCapacity(node);
    if (node.troops < capacity && !productionPaused(world, node)) {
      node.troops = Math.min(capacity, node.troops + troopRate(node, side.modifiers) * dtSec);
    }
    side.gold += goldRate(node, side.modifiers) * incomeMult[node.owner] * dtSec;
  }
}
