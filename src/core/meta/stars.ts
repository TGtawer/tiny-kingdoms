import { STARS } from '../../config/balance';
import type { LevelData } from '../level/schema';
import type { Progress } from './Progress';

/** What the star rating needs to know about a finished battle. */
export interface BattleSummary {
  won: boolean;
  /** Simulation time of the battle, ms (speed-up does not change it). */
  timeMs: number;
  /** The player lost at least one own node during the battle. */
  lostOwnNode: boolean;
}

/** Time to beat for the "fast" star, s: the level's own value or the default. */
export function starTimeSec(level: LevelData): number {
  return level.starTimeSec ?? STARS.defaultTimeSec;
}

/** The three star conditions in display order: victory, faster than the level time, no own node lost. */
export type StarChecks = [won: boolean, fast: boolean, flawless: boolean];

/** Which star conditions were met. Nothing counts on defeat. */
export function starChecks(summary: BattleSummary, level: LevelData): StarChecks {
  if (!summary.won) return [false, false, false];
  return [true, summary.timeMs <= starTimeSec(level) * 1000, !summary.lostOwnNode];
}

/**
 * 0 on defeat; on victory 1 star, +1 for winning faster than the level's time, +1 for not losing any own node.
 * TODO(design): whether stars change the crystal reward is TBD (UX.md 4.2); they don't for now.
 */
export function starsFor(summary: BattleSummary, level: LevelData): number {
  return starChecks(summary, level).filter(Boolean).length;
}

/** All stars earned (best result per level, summed). Never decreases. */
export function totalStars(progress: Progress): number {
  return Object.values(progress.stars).reduce((sum, s) => sum + s, 0);
}

/** Stars left to spend on spell upgrades. */
export function freeStars(progress: Progress): number {
  return Math.max(0, totalStars(progress) - progress.spentStars);
}

export function bestStars(progress: Progress, levelId: string): number {
  return progress.stars[levelId] ?? 0;
}

/** Keeps the best result. Returns true if it improved. */
export function recordStars(progress: Progress, levelId: string, stars: number): boolean {
  if (stars <= bestStars(progress, levelId)) return false;
  progress.stars[levelId] = stars;
  return true;
}
