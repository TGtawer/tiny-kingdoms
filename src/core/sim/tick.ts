import { ARMY, SPELL_IDS, TICK_MS } from '../../config/balance';
import { resolveClashes, type ClashResult } from './clash';
import { arrive, type ArrivalResult } from './combat';
import { apply, validate, type Command, type RejectReason } from './commands';
import { produce } from './economy';
import { segmentLength } from './pathfinding';
import { stepBandits, type BanditRaid } from './bandits';
import { stepCitadel, type CitadelWave } from './specials/citadel';
import { stepDragon, type DragonEvent } from './specials/dragon';
import { checkOutcome, updateGoal, type OutcomeReason } from './victory';
import type { ArmyState, Side, World } from './World';

export const TICK_SEC = TICK_MS / 1000;

export type TickEvent =
  | { type: 'rejected'; command: Command; reason: RejectReason }
  | { type: 'applied'; command: Command; armyId?: string }
  | ({ type: 'arrived' } & ArrivalResult)
  | ({ type: 'clash' } & ClashResult)
  | ({ type: 'raid' } & BanditRaid)
  | DragonEvent
  | CitadelWave
  | { type: 'gameOver'; winner: Side; reason: OutcomeReason };

/**
 * Moves an army along its path. Returns true when it reaches the target.
 * Armies only travel through their own nodes: if a stop on the way has been captured meanwhile,
 * the army ends its march there and attacks that node instead.
 */
function moveArmy(world: World, army: ArmyState, distanceLeft: number): boolean {
  let remaining = distanceLeft;
  while (army.segment < army.path.length - 1) {
    const length = segmentLength(world, army.path[army.segment]!, army.path[army.segment + 1]!);
    const toEnd = (1 - army.progress) * length;
    if (remaining < toEnd) {
      army.progress += remaining / length;
      return false;
    }
    remaining -= toEnd;
    army.segment += 1;
    army.progress = 0;

    const reached = army.path[army.segment]!;
    if (army.segment < army.path.length - 1 && world.nodes[reached]!.owner !== army.owner) {
      army.targetId = reached;
      army.path = army.path.slice(0, army.segment + 1);
      return true;
    }
  }
  return true;
}

/**
 * One fixed simulation step. Mutates `world`.
 * Order: commands → production → cooldowns → road clashes → army movement and arrivals → victory check.
 */
export function step(world: World, commands: readonly Command[] = []): TickEvent[] {
  if (world.winner) return [];
  const events: TickEvent[] = [];

  for (const command of commands) {
    const reason = validate(world, command);
    if (reason) {
      events.push({ type: 'rejected', command, reason });
      continue;
    }
    const army = apply(world, command);
    events.push(army ? { type: 'applied', command, armyId: army.id } : { type: 'applied', command });
  }

  produce(world, TICK_SEC);
  for (const raid of stepBandits(world)) events.push({ type: 'raid', ...raid });
  if (world.boss?.type === 'dragon') events.push(...stepDragon(world, world.boss));
  else if (world.boss?.type === 'citadel') events.push(...stepCitadel(world, world.boss));

  for (const node of Object.values(world.nodes)) {
    if (node.shieldTicks > 0) node.shieldTicks -= 1;
  }
  for (const side of Object.values(world.sides)) {
    for (const spell of SPELL_IDS) {
      side.spellCooldowns[spell] = Math.max(0, side.spellCooldowns[spell] - TICK_MS);
    }
  }

  // Opposite armies meeting head-on on a road fight before anyone moves on.
  for (const clash of resolveClashes(world, ARMY.speed * TICK_SEC)) events.push({ type: 'clash', ...clash });

  // Arrivals resolve in army creation order, so results are deterministic.
  const stillMoving: ArmyState[] = [];
  for (const army of world.armies) {
    if (moveArmy(world, army, ARMY.speed * TICK_SEC)) {
      events.push({ type: 'arrived', ...arrive(world, army) });
    } else {
      stillMoving.push(army);
    }
  }
  world.armies = stillMoving;

  world.tick += 1;

  updateGoal(world);
  const outcome = checkOutcome(world);
  if (outcome) {
    world.winner = outcome.winner;
    events.push({ type: 'gameOver', winner: outcome.winner, reason: outcome.reason });
  }
  return events;
}
