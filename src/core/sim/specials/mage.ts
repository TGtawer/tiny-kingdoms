import { MAGE, TICK_MS } from '../../../config/balance';
import { markAttacked } from '../combat';
import { random, type NodeState, type World } from '../World';
import { biggestGarrison, stepStrikeTimer, type StrikeTimer } from './strikeTimer';

/**
 * Evil mage boss (chapter 1, level 10; TUTORIAL.md T-7): sits in his tower, the enemy capital, and throws
 * fireballs at the player's biggest garrison while the tower is the enemy's. Enemy and neutral nodes are safe.
 */
export interface MageState extends StrikeTimer {
  type: 'mage';
  /** The mage tower (the enemy capital). */
  towerId: string;
}

export type MageEvent =
  | { type: 'mageWarning'; nodeId: string; strikeTick: number }
  | { type: 'mageStrike'; nodeId: string; killed: number; from: string };

const EVERY_TICKS = Math.round(MAGE.everyMs / TICK_MS);
const WARN_TICKS = Math.round(MAGE.warnMs / TICK_MS);

export function createMage(towerId: string): MageState {
  return { type: 'mage', towerId, strikeTick: EVERY_TICKS, targetId: null };
}

/** The player's node with the most troops; ties by the seeded RNG. */
export function mageTarget(world: World): NodeState | null {
  return biggestGarrison(
    world,
    Object.values(world.nodes).filter((n) => n.owner === 'player'),
    random,
  );
}

/** Troops a fireball of the mage destroys: MAGE.damageShare of the garrison, at least MAGE.damageMin. */
export function mageDamage(garrison: number): number {
  return Math.min(garrison, Math.max(MAGE.damageMin, garrison * MAGE.damageShare));
}

/**
 * Every MAGE.everyMs a fireball flies from the tower to the player's biggest garrison, announced MAGE.warnMs
 * before. A shield takes the hit; a node that is no longer the player's is spared. Stops once the tower falls.
 */
export function stepMage(world: World, mage: MageState): MageEvent[] {
  if (world.nodes[mage.towerId]?.owner !== 'enemy') {
    mage.targetId = null;
    return [];
  }
  const events: MageEvent[] = [];
  const strikeTick = mage.strikeTick;
  const { warned, struck } = stepStrikeTimer(world, mage, EVERY_TICKS, WARN_TICKS, () => mageTarget(world));
  if (warned) events.push({ type: 'mageWarning', nodeId: warned.id, strikeTick });
  if (struck) {
    const hits = struck.owner === 'player' && struck.shieldTicks <= 0;
    const killed = hits ? mageDamage(struck.troops) : 0;
    struck.troops -= killed;
    // A hit on the garrison is an attack (GDD 3.6, 3.8); a shield takes it without one.
    if (hits) markAttacked(world, struck);
    events.push({ type: 'mageStrike', nodeId: struck.id, killed, from: mage.towerId });
  }
  return events;
}
