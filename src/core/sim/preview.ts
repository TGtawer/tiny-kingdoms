import { ARMY, BUILDINGS, STREAM } from '../../config/balance';
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
 * How long a unit walks through the tower zone of `node` before it reaches the node, s (docs/TOWER.md): from the
 * zone border (BUILDINGS.tower.zone from the center) to where units arrive (STREAM.edgeDist of the node).
 */
export function towerZoneSec(node: NodeState): number {
  return Math.max(0, BUILDINGS.tower.zone - STREAM.edgeDist[node.size]) / ARMY.speed;
}

/**
 * Roughly how many of `sent` units a tower shoots while a send arrives (docs/TOWER.md): the shot in reserve, then
 * rate × (the time the longest stream takes to leave + the time its last unit walks through the zone) — the tower
 * starts when the head of the column enters the zone and stops when the tail reaches the node. Not exact — the
 * streams of a multi-node swipe arrive in waves.
 */
export function towerKillsEstimate(node: NodeState, sent: number, longestStream: number): number {
  const rate = towerRate(node);
  if (rate <= 0 || sent <= 0) return 0;
  const releaseSec = longestStream / (STREAM.releasePerSec * STREAM.width);
  return Math.min(sent, 1 + Math.floor(rate * (releaseSec + towerZoneSec(node))));
}

/**
 * Outcome hint for sending from `sources` to `targetId`: tower shots on the way (approximately, docs/TOWER.md), then
 * the rules of an arrival (combat.ts): 1:1 trades (a fortress defender takes two), and one more unit to capture.
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
