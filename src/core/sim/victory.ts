import { TICK_MS } from '../../config/balance';
import type { Side, World } from './World';

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
 * Result of the battle, or null while it goes on. Armies still on the road don't count.
 * Both sides can't be eliminated on the same tick, because every capture gives the attacker a node.
 */
export function checkOutcome(world: World): Outcome | null {
  let player = false;
  let enemy = false;
  for (const node of Object.values(world.nodes)) {
    if (node.owner === 'player') player = true;
    else if (node.owner === 'enemy') enemy = true;
  }
  if (!player) return { winner: 'enemy', reason: 'eliminated' };

  const goal = world.goal;
  if (goal.type === 'capital') {
    const own = world.capitals.player;
    const theirs = world.capitals.enemy;
    if (own && world.nodes[own]!.owner !== 'player') return { winner: 'enemy', reason: 'capitalLost' };
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
