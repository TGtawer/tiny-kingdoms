import type { Side, World } from './World';

/**
 * Victory: the enemy has no nodes (neutrals don't matter). Defeat: the player has no nodes.
 * Armies still on the road don't count. Both sides can't lose on the same tick,
 * because every capture gives the attacker a node.
 */
export function checkWinner(world: World): Side | null {
  let player = false;
  let enemy = false;
  for (const node of Object.values(world.nodes)) {
    if (node.owner === 'player') player = true;
    else if (node.owner === 'enemy') enemy = true;
  }
  if (!player) return 'enemy';
  if (!enemy) return 'player';
  return null;
}
