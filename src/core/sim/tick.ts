import { ARMY, SPELL_IDS, TICK_MS } from '../../config/balance';
import { resolveClashes, type ClashResult } from './clash';
import { arriveUnit, type ArrivalResult } from './combat';
import { apply, validate, type Command, type RejectReason } from './commands';
import { produce } from './economy';
import { stepBandits, type BanditRaid } from './bandits';
import { stepCitadel, type CitadelWave } from './specials/citadel';
import { stepDragon, type DragonEvent } from './specials/dragon';
import { stepMage, type MageEvent } from './specials/mage';
import { enterTransit, releaseStreams } from './stream';
import { dropUnit, moveUnits } from './units';
import { checkOutcome, updateGoal, type OutcomeReason } from './victory';
import type { Owner, Side, World } from './World';

export const TICK_SEC = TICK_MS / 1000;

export type TickEvent =
  | { type: 'rejected'; command: Command; reason: RejectReason }
  | { type: 'applied'; command: Command; streamId?: number }
  | ({ type: 'arrived' } & ArrivalResult)
  /** A unit entered an own node on its way and will leave it again (GDD 3.6, transit). */
  | { type: 'transit'; unitId: number; owner: Owner; nodeId: string }
  | ({ type: 'clash' } & ClashResult)
  | ({ type: 'raid' } & BanditRaid)
  | DragonEvent
  | MageEvent
  | CitadelWave
  | { type: 'gameOver'; winner: Side; reason: OutcomeReason };

// Clash results of one tick (reused list; copied into events).
const clashes: ClashResult[] = [];

/**
 * One fixed simulation step. Mutates `world`. Order (ARCHITECTURE.md «Порядок тика»):
 * commands → road clashes (swept, before moving) → unit movement, arrivals and transit → stream release →
 * production → bandits and bosses → shields and cooldowns → goal and victory check.
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
    const stream = apply(world, command);
    events.push(stream ? { type: 'applied', command, streamId: stream.id } : { type: 'applied', command });
  }

  const stepDistance = ARMY.speed * TICK_SEC;
  clashes.length = 0;
  resolveClashes(world, stepDistance, clashes);
  for (const clash of clashes) events.push({ type: 'clash', ...clash });

  moveUnits(world, stepDistance, (unit, nodeId) => {
    dropUnit(world, unit);
    const node = world.nodes[nodeId]!;
    const rest = unit.route.next;
    // Transit through an own node (GDD 3.6): into its garrison, then out again with the rest of the route.
    if (rest && node.owner === unit.owner) {
      enterTransit(world, unit.owner, nodeId, rest);
      events.push({ type: 'transit', unitId: unit.id, owner: unit.owner, nodeId });
      return;
    }
    // The target, or a stop on the way that is no longer own: the unit attacks it (or reinforces its target).
    events.push({ type: 'arrived', ...arriveUnit(world, unit.id, unit.owner, node, unit.route.path[0]!) });
  });
  releaseStreams(world);

  produce(world, TICK_SEC);
  for (const raid of stepBandits(world)) events.push({ type: 'raid', ...raid });
  if (world.boss?.type === 'dragon') events.push(...stepDragon(world, world.boss));
  else if (world.boss?.type === 'citadel') events.push(...stepCitadel(world, world.boss));
  else if (world.boss?.type === 'mage') events.push(...stepMage(world, world.boss));

  for (const node of Object.values(world.nodes)) {
    if (node.shieldTicks > 0) node.shieldTicks -= 1;
  }
  for (const side of Object.values(world.sides)) {
    for (const spell of SPELL_IDS) {
      side.spellCooldowns[spell] = Math.max(0, side.spellCooldowns[spell] - TICK_MS);
    }
  }

  world.tick += 1;

  updateGoal(world);
  const outcome = checkOutcome(world);
  if (outcome) {
    world.winner = outcome.winner;
    events.push({ type: 'gameOver', winner: outcome.winner, reason: outcome.reason });
  }
  return events;
}
