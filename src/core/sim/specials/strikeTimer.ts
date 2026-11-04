import type { NodeState, World } from '../World';

/**
 * Shared timer of the striking bosses (dragon, evil mage): every `everyTicks` a strike hits one node.
 * The target is picked `warnTicks` before the strike and announced, so players can move troops out.
 */
export interface StrikeTimer {
  /** Tick of the next strike. */
  strikeTick: number;
  /** Node chosen at the warning; null before the warning. */
  targetId: string | null;
}

export interface StrikeStep {
  /** The node just marked (this tick). */
  warned: NodeState | null;
  /** The node hit this tick (the marked one), or null. */
  struck: NodeState | null;
}

/**
 * Advances the timer by one tick. `pick` chooses the target at the warning (null: nobody to hit this round).
 * The caller applies the damage to `struck`. After a strike the next round starts.
 */
export function stepStrikeTimer(
  world: World,
  timer: StrikeTimer,
  everyTicks: number,
  warnTicks: number,
  pick: () => NodeState | null,
): StrikeStep {
  let warned: NodeState | null = null;
  let struck: NodeState | null = null;
  if (timer.targetId === null && world.tick >= timer.strikeTick - warnTicks) {
    warned = pick();
    if (warned) timer.targetId = warned.id;
  }
  if (world.tick >= timer.strikeTick) {
    if (timer.targetId) struck = world.nodes[timer.targetId] ?? null;
    timer.strikeTick += everyTicks;
    timer.targetId = null;
  }
  return { warned, struck };
}

/** The node with the most troops among `nodes`; ties by the seeded RNG. */
export function biggestGarrison(world: World, nodes: readonly NodeState[], random: (world: World) => number): NodeState | null {
  let best: NodeState[] = [];
  let max = -Infinity;
  for (const node of nodes) {
    if (node.troops > max + 1e-9) {
      best = [node];
      max = node.troops;
    } else if (Math.abs(node.troops - max) <= 1e-9) {
      best.push(node);
    }
  }
  if (best.length === 0) return null;
  return best.length === 1 ? best[0]! : best[Math.floor(random(world) * best.length)]!;
}
