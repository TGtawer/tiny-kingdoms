import { DRAGON, TICK_MS } from '../../../config/balance';
import { random, type NodeState, type World } from '../World';
import { biggestGarrison, stepStrikeTimer, type StrikeTimer } from './strikeTimer';

/** Dragon boss state (in reserve: dev level dev_dragon). */
export interface DragonState extends StrikeTimer {
  type: 'dragon';
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
  return biggestGarrison(
    world,
    Object.values(world.nodes).filter((n) => n.owner !== 'neutral'),
    random,
  );
}

/**
 * Every DRAGON.everyMs the dragon burns DRAGON.burnShare of the troops in one node. The target is picked
 * DRAGON.warnMs before the strike and announced, so players can move troops out (or lure the enemy in).
 */
export function stepDragon(world: World, dragon: DragonState): DragonEvent[] {
  const events: DragonEvent[] = [];
  const strikeTick = dragon.strikeTick;
  const { warned, struck } = stepStrikeTimer(world, dragon, EVERY_TICKS, WARN_TICKS, () => dragonTarget(world));
  if (warned) events.push({ type: 'dragonWarn', nodeId: warned.id, strikeTick });
  if (struck) {
    const killed = struck.shieldTicks > 0 ? 0 : struck.troops * DRAGON.burnShare;
    struck.troops -= killed;
    events.push({ type: 'dragonStrike', nodeId: struck.id, killed });
  }
  return events;
}
