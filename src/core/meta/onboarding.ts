import { SPELL_UNLOCKS } from '../../config/balance';
import type { Progress } from './Progress';
import { claimableSpell, setActiveSpell, unlockSpell } from './spellbook';

/**
 * The Upgrades tour after the first win on level 6 (TUTORIAL.md T-6): chapter map → Upgrades → claim
 * Reinforcement → back to the map. Saved after every step, so a restart continues where the player left.
 *
 * Steps: 1 map, the Upgrades button; 2 crystals; 3 spells and stars; 4 claim the spell; 5 back to the map.
 */

export type TourStep = 1 | 2 | 3 | 4 | 5;
export type TourState = 'pending' | TourStep | 'done';
export const TOUR_STEPS: readonly TourStep[] = [1, 2, 3, 4, 5];

/** The level whose first win starts the tour: the one that gives the tour spell. */
export function tourLevel(): string {
  const rule = SPELL_UNLOCKS.reinforcement;
  return 'tour' in rule ? rule.tour : rule.afterWin;
}

/** The step to show now, or null when there is no tour (level not won yet, or the tour is done). */
export function tourStep(progress: Progress): TourStep | null {
  const state = progress.onboarding.upgradesTour;
  if (state === 'done' || !progress.completed.includes(tourLevel())) return null;
  if (state === 'pending') return 1;
  // The spell is already in hand (e.g. claimed on another device): skip to the last step.
  if (state === 4 && claimableSpell(progress) === null) return 5;
  return state;
}

/** Where a step happens: step 1 on the chapter map, the rest on the Upgrades screen. */
export function tourScene(step: TourStep): 'ChapterMapScene' | 'UpgradesScene' {
  return step === 1 ? 'ChapterMapScene' : 'UpgradesScene';
}

/**
 * Finishes step `from` if it is the current one and moves on (5 → done). Step 4 is finished by
 * claimTourSpell. Returns false if `from` is not the current step.
 */
export function advanceTour(progress: Progress, from: TourStep): boolean {
  if (tourStep(progress) !== from || from === 4) return false;
  progress.onboarding.upgradesTour = from === 5 ? 'done' : ((from + 1) as TourStep);
  return true;
}

/** Step 4: the player claims the tour spell; it is unlocked and made active. Returns false outside step 4. */
export function claimTourSpell(progress: Progress): boolean {
  if (tourStep(progress) !== 4) return false;
  const spell = claimableSpell(progress);
  if (spell) {
    unlockSpell(progress, spell);
    setActiveSpell(progress, spell);
  }
  progress.onboarding.upgradesTour = 5;
  return true;
}
