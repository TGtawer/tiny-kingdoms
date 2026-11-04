import { SPELL_IDS, SPELL_UNLOCKS, type SpellId } from '../../config/balance';
import type { Progress } from './Progress';

/**
 * GDD 3.8, TUTORIAL.md T-3: spells are given by the story in the fixed order of SPELL_UNLOCKS, there is no choice.
 * The first unlocked spell becomes active; later ones do not (the player switches in the Upgrades screen).
 * Exactly one unlocked spell is active and goes into battle.
 */

/** Unlocks `spell`. Returns false if it was already unlocked. The first unlocked spell becomes active. */
export function unlockSpell(progress: Progress, spell: SpellId): boolean {
  if (progress.unlockedSpells.includes(spell)) return false;
  progress.unlockedSpells.push(spell);
  progress.activeSpell ??= spell;
  return true;
}

/** Unlocks the spells given for winning `levelId` (call on every win; repeats give nothing). Returns the new ones. */
export function grantWinSpells(progress: Progress, levelId: string): SpellId[] {
  return SPELL_IDS.filter((s) => {
    const rule = SPELL_UNLOCKS[s];
    return 'afterWin' in rule && rule.afterWin === levelId && unlockSpell(progress, s);
  });
}

/** A spell given in the Upgrades tour that the player can claim now (its level is won, the spell is not unlocked). */
export function claimableSpell(progress: Progress): SpellId | null {
  return (
    SPELL_IDS.find((s) => {
      const rule = SPELL_UNLOCKS[s];
      return 'tour' in rule && progress.completed.includes(rule.tour) && !progress.unlockedSpells.includes(s);
    }) ?? null
  );
}

/** The level whose win gives `spell` (for the lock hint). */
export function spellUnlockLevel(spell: SpellId): string {
  const rule = SPELL_UNLOCKS[spell];
  return 'tour' in rule ? rule.tour : rule.afterWin;
}

/** Makes an unlocked spell the one taken into battle. Returns false if the spell is not unlocked. */
export function setActiveSpell(progress: Progress, spell: SpellId): boolean {
  if (!progress.unlockedSpells.includes(spell)) return false;
  progress.activeSpell = spell;
  return true;
}

/** The spell taken into battle, or null while none is unlocked. */
export function activeSpell(progress: Progress): SpellId | null {
  const active = progress.activeSpell;
  return active !== null && progress.unlockedSpells.includes(active) ? active : null;
}
