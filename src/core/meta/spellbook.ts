import { SPELL_IDS, SPELL_SLOT_STARS, type SpellId } from '../../config/balance';
import type { Progress } from './Progress';
import { totalStars } from './stars';

/**
 * GDD 3.8: spells are opened by the player's choice. Every star threshold in SPELL_SLOT_STARS gives one slot,
 * the player picks which spell goes into it. Exactly one open spell is active and goes into battle;
 * it can be switched between levels.
 */

/** How many spells the player may have open with the stars earned so far. */
export function spellSlots(progress: Progress): number {
  const stars = totalStars(progress);
  return SPELL_SLOT_STARS.filter((need) => stars >= need).length;
}

/** Total stars needed for the next slot, or null when all thresholds are reached. */
export function nextSlotStars(progress: Progress): number | null {
  const stars = totalStars(progress);
  return SPELL_SLOT_STARS.find((need) => stars < need) ?? null;
}

/** Whether a free slot is waiting for the player's choice. */
export function canOpenSpell(progress: Progress): boolean {
  return progress.openSpells.length < spellSlots(progress) && SPELL_IDS.some((s) => !progress.openSpells.includes(s));
}

export type OpenResult = 'ok' | 'noSlot' | 'alreadyOpen';

/** Opens `spell` in a free slot. The first open spell becomes active right away. */
export function openSpell(progress: Progress, spell: SpellId): OpenResult {
  if (progress.openSpells.includes(spell)) return 'alreadyOpen';
  if (progress.openSpells.length >= spellSlots(progress)) return 'noSlot';
  progress.openSpells.push(spell);
  progress.activeSpell ??= spell;
  return 'ok';
}

/** Makes an open spell the one taken into battle. Returns false if the spell is not open. */
export function setActiveSpell(progress: Progress, spell: SpellId): boolean {
  if (!progress.openSpells.includes(spell)) return false;
  progress.activeSpell = spell;
  return true;
}

/** The spell taken into battle, or null while none is open. */
export function activeSpell(progress: Progress): SpellId | null {
  const active = progress.activeSpell;
  return active !== null && progress.openSpells.includes(active) ? active : null;
}
