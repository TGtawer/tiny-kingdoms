import { SPELLS, TICK_MS, type SpellId } from '../../config/balance';
import type { SideModifiers } from './World';

// TODO(design): GDD lists a spell cost upgrade, but BALANCE.md has no numbers for it yet.
export function spellCost(spell: SpellId): number {
  return SPELLS[spell].cost;
}

export function spellCooldownMs(spell: SpellId, modifiers: SideModifiers): number {
  const sec = SPELLS[spell].cooldownSec - modifiers.spells[spell].cooldownReductionSec;
  return Math.max(0, Math.round(sec * 1000));
}

/** Troops a fireball kills in a garrison: share of troops, at least minKill, never more than present. */
export function fireballKill(garrison: number, modifiers: SideModifiers): number {
  const share = SPELLS.fireball.killShare + modifiers.spells.fireball.killShareBonus;
  return Math.min(garrison, Math.max(SPELLS.fireball.minKill, garrison * share));
}

export function reinforcementTroops(modifiers: SideModifiers): number {
  return SPELLS.reinforcement.troops + modifiers.spells.reinforcement.extraTroops;
}

/** How long a shield lasts, in ticks. */
export function shieldTicks(modifiers: SideModifiers): number {
  return Math.round(((SPELLS.shield.durationSec + modifiers.spells.shield.extraDurationSec) * 1000) / TICK_MS);
}
