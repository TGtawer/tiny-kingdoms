import { DRAGON, TICK_MS } from '../../../config/balance';
import { random, type NodeState, type World } from '../World';

/** Dragon boss state (chapter 1, level 10). */
export interface DragonState {
  type: 'dragon';
  /** Tick of the next strike. */
  strikeTick: number;
  /** Node chosen at the warning (DRAGON.warnMs before the strike); null before the warning. */
  targetId: string | null;
}

export type DragonEvent =
  | { type: 'dragonWarn'; nodeId: string; strikeTick: number }
  | { type: 'dragonStrike'; nodeId: string; killed: number };

const EVERY_TICKS = Math.round(DRAGON.everyMs / TICK_MS);
const WARN_TICKS = Math.round(DRAGON.warnMs / TICK_MS);

export function createDragon(): DragonState {
  return { type: 'dragon', strikeTick: EVERY_TICKS, targetId: null };
}

/** The node with the biggest garrison of the player or the enemy (neutrals are left alone); ties by the seeded RNG. */
export function dragonTarget(world: World): NodeState | null {
  let best: NodeState[] = [];
  let max = -Infinity;
  for (const node of Object.values(world.nodes)) {
    if (node.owner === 'neutral') continue;
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

/**
 * Every DRAGON.everyMs the dragon burns DRAGON.burnShare of the troops in one node. The target is picked
 * DRAGON.warnMs before the strike and announced, so players can move troops out (or lure the enemy in).
 */
export function stepDragon(world: World, dragon: DragonState): DragonEvent[] {
  const events: DragonEvent[] = [];
  if (dragon.targetId === null && world.tick >= dragon.strikeTick - WARN_TICKS) {
    const target = dragonTarget(world);
    if (target) {
      dragon.targetId = target.id;
      events.push({ type: 'dragonWarn', nodeId: target.id, strikeTick: dragon.strikeTick });
    }
  }
  if (world.tick >= dragon.strikeTick) {
    if (dragon.targetId) {
      const node = world.nodes[dragon.targetId]!;
      const killed = node.shieldTicks > 0 ? 0 : node.troops * DRAGON.burnShare;
      node.troops -= killed;
      events.push({ type: 'dragonStrike', nodeId: node.id, killed });
    }
    dragon.strikeTick += EVERY_TICKS;
    dragon.targetId = null;
  }
  return events;
}
