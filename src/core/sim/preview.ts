import { resolveBattle, towerDamage } from './combat';
import { sendAmount, visibleTroops, type SendMode } from './commands';
import { armyPath } from './pathfinding';
import { defenseStrength, strengthOf, type Side, type World } from './World';

export interface AttackPreview {
  /** Troops that would leave: only sources with a route to the target. */
  sent: number;
  /** Visible garrison of the target now (0 for an own target). */
  defenders: number;
  /** Whether the armies would capture the target if nothing changed on the way (always true for an own target). */
  wins: boolean;
}

/**
 * Outcome hint for sending from `sources` to `targetId`, with the same rules as an arrival (combat.ts):
 * the tower hits each arriving army once, then units trade 1:1 scaled by unit strength (fortress defenders ×2).
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

  const armies: number[] = [];
  for (const id of sources) {
    const from = world.nodes[id];
    if (!from || id === targetId || from.owner !== side) continue;
    const count = sendAmount(from.troops, mode);
    if (count > 0 && armyPath(world, side, id, targetId)) armies.push(count);
  }
  const sent = armies.reduce((sum, n) => sum + n, 0);
  if (target.owner === side) return { sent, defenders: 0, wins: true };

  const damage = towerDamage(target);
  const attackers = armies.reduce((sum, n) => sum + Math.max(0, n - damage), 0);
  const wins =
    attackers > 0 && resolveBattle(attackers, strengthOf(world, side), target.troops, defenseStrength(world, target)).attackersLeft > 0;
  return { sent, defenders: visibleTroops(target.troops), wins };
}
