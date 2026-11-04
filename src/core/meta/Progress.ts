import type { SpellId } from '../../config/balance';
import type { LevelData } from '../level/schema';

export type BonusId = 'startArmy' | 'troopProduction' | 'goldIncome' | 'unitStrength';
export const BONUS_IDS: readonly BonusId[] = ['startArmy', 'troopProduction', 'goldIncome', 'unitStrength'];

/** Everything the player keeps between battles. Plain data, saved as part of SaveData. */
export interface Progress {
  crystals: number;
  /** Ids of levels won at least once. */
  completed: string[];
  bonuses: Record<BonusId, number>;
  spellUpgrades: Record<SpellId, number>;
  /** Best star rating per level id, 1..3 (see stars.ts). */
  stars: Record<string, number>;
  /** Stars spent on spell upgrades; free stars = total earned - spent (see stars.ts). */
  spentStars: number;
  /** Spells given by the story so far, in the order unlocked (see spellbook.ts). */
  unlockedSpells: SpellId[];
  /** The unlocked spell taken into battle; null until the first one is unlocked. */
  activeSpell: SpellId | null;
}

export function defaultProgress(): Progress {
  return {
    crystals: 0,
    completed: [],
    bonuses: { startArmy: 0, troopProduction: 0, goldIncome: 0, unitStrength: 0 },
    spellUpgrades: { fireball: 0, reinforcement: 0, shield: 0 },
    stars: {},
    spentStars: 0,
    unlockedSpells: [],
    activeSpell: null,
  };
}

export function isCompleted(progress: Progress, levelId: string): boolean {
  return progress.completed.includes(levelId);
}

/** Levels open strictly in order (GDD 4.1): the first one, and any whose predecessor is completed. */
export function isUnlocked(progress: Progress, levels: readonly LevelData[], levelId: string): boolean {
  const i = levels.findIndex((l) => l.id === levelId);
  if (i < 0) return false;
  return i === 0 || isCompleted(progress, levels[i - 1]!.id);
}

/** The level the player should play next: the first unlocked one not yet completed (or the last level). */
export function currentLevel(progress: Progress, levels: readonly LevelData[]): LevelData | null {
  return levels.find((l) => !isCompleted(progress, l.id)) ?? levels[levels.length - 1] ?? null;
}

/** A chapter counts as completed when its last level is won (levels open in order, so all before it are too). */
export function isChapterCompleted(progress: Progress, levels: readonly LevelData[], chapter: number): boolean {
  const chapterLevels = levels.filter((l) => l.chapter === chapter);
  const last = chapterLevels[chapterLevels.length - 1];
  return last !== undefined && isCompleted(progress, last.id);
}

export function markCompleted(progress: Progress, levelId: string): void {
  if (!isCompleted(progress, levelId)) progress.completed.push(levelId);
}
