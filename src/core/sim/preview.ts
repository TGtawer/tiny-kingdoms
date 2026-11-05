import { STREAM } from '../../config/balance';
import { defenseHits, towerRate } from './combat';
import { sendAmount, visibleTroops, type SendMode } from './commands';
import { armyPath } from './pathfinding';
import type { NodeState, Side, World } from './World';

export interface AttackPreview {
  /** Troops that would leave: only sources with a route to the target. */
  sent: number;
  /** Visible garrison of the target now (0 for an own target). */
  defenders: number;
  /** Whether the units would capture the target if nothing changed on the way (always true for an own target). */
  wins: boolean;
}

/**
 * Roughly how many of `sent` units a tower shoots while a send arrives (GDD 3.6, 6): the shot in reserve plus
 * rate × the time the longest stream takes to leave. Not exact — the streams of a multi-node swipe arrive in waves.
 */
export function towerKillsEstimate(node: NodeState, sent: number, longestStream: number): number {
  const rate = towerRate(node);
  if (rate <= 0 || sent <= 0) return 0;
  const releaseSec = longestStream / (STREAM.releasePerSec * STREAM.width);
  return Math.min(sent, 1 + Math.floor(rate * releaseSec));
}

/**
 * Outcome hint for sending from `sources` to `targetId`, with the rules of an arrival (combat.ts): tower shots
 * (approximately), then 1:1 trades (a fortress defender takes two), and one more unit to capture.
 * Not a guarantee: production at the target and clashes on the way are ignored.
 */
export function previewAttack(
  world: World,
  side: Side,
  sources: readonly string[],
  mode: SendMode,
  targetId: string,
): AttackPreview {
  const target = world.nodes[targetId];
  if (!target) return { sent: 0, defenders: 0, wins: false };

  let sent = 0;
  let longest = 0;
  for (const id of sources) {
    const from = world.nodes[id];
    if (!from || id === targetId || from.owner !== side) continue;
    const count = sendAmount(from.troops, mode);
    if (count > 0 && armyPath(world, side, id, targetId)) {
      sent += count;
      longest = Math.max(longest, count);
    }
  }
  if (target.owner === side) return { sent, defenders: 0, wins: true };

  const defenders = visibleTroops(target.troops);
  if (target.shieldTicks > 0) return { sent, defenders, wins: false };
  const attackers = sent - towerKillsEstimate(target, sent, longest);
  return { sent, defenders, wins: attackers > defenseHits(target) };
}
