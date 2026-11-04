import { TICK_MS } from '../../config/balance';
import { ENEMY_SIDES, type Side, type World } from './World';

/**
 * Level goal (GDD 3.9). Every goal also wins by plain conquest, and the player always loses with no nodes left.
 * - conquer: the enemy has no nodes;
 * - hold: keep `nodeId` for `seconds` in a row (the timer restarts when the node is lost);
 * - survive: last `seconds`;
 * - capital: capture the enemy capital; losing the own capital is a defeat.
 */
export type Goal =
  | { type: 'conquer' }
  | { type: 'hold'; nodeId: string; seconds: number }
  | { type: 'survive'; seconds: number }
  | { type: 'capital' };

/** Why the battle ended (shown on the result screen). */
export type OutcomeReason = 'conquer' | 'hold' | 'survive' | 'capital' | 'eliminated' | 'capitalLost';

export interface Outcome {
  winner: Side;
  reason: OutcomeReason;
}

/** Advances goal timers by one tick (hold). Called by `step` before the outcome check. */
export function updateGoal(world: World): void {
  const goal = world.goal;
  if (goal.type === 'hold') {
    world.goalTicks = world.nodes[goal.nodeId]?.owner === 'player' ? world.goalTicks + 1 : 0;
  }
}

/** Seconds of progress towards a timed goal (hold: held in a row; survive: battle time). */
export function goalProgressSec(world: World): number {
  if (world.goal.type === 'hold') return (world.goalTicks * TICK_MS) / 1000;
  if (world.goal.type === 'survive') return (world.tick * TICK_MS) / 1000;
  return 0;
}

/**
 * Result of the battle, or null while it goes on. With a second enemy the player wins only when both are gone. Armies still on the road don't count.
 * Both sides can't be eliminated on the same tick, because every capture gives the attacker a node.
 */
export function checkOutcome(world: World): Outcome | null {
  const count: Record<Side, number> = { player: 0, enemy: 0, enemy2: 0 };
  for (const node of Object.values(world.nodes)) if (node.owner !== 'neutral') count[node.owner] += 1;
  // With two enemies the one holding more nodes is named the winner (both count as a defeat for the player).
  const strongestEnemy: Side = count.enemy2 > count.enemy ? 'enemy2' : 'enemy';
  if (count.player === 0) return { winner: strongestEnemy, reason: 'eliminated' };
  const enemy = ENEMY_SIDES.some((s) => count[s] > 0);

  const goal = world.goal;
  if (goal.type === 'capital') {
    const own = world.capitals.player;
    const theirs = world.capitals.enemy;
    const ownOwner = own ? world.nodes[own]!.owner : 'player';
    if (ownOwner !== 'player') return { winner: ownOwner === 'neutral' ? strongestEnemy : ownOwner, reason: 'capitalLost' };
    if (theirs && world.nodes[theirs]!.owner === 'player') return { winner: 'player', reason: 'capital' };
  }
  if (!enemy) return { winner: 'player', reason: 'conquer' };
  if (goal.type === 'hold' && (world.goalTicks * TICK_MS) / 1000 >= goal.seconds) return { winner: 'player', reason: 'hold' };
  if (goal.type === 'survive' && (world.tick * TICK_MS) / 1000 >= goal.seconds) return { winner: 'player', reason: 'survive' };
  return null;
}

/** Winner only (see checkOutcome). */
export function checkWinner(world: World): Side | null {
  return checkOutcome(world)?.winner ?? null;
}
