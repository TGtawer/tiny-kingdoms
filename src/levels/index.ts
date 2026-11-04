import { loadChapter, loadLevel } from '../core/level/loader';
import type { LevelData } from '../core/level/schema';
import type { TutorialScript } from '../core/tutorial/tutorial';
import l01 from './chapter01/level01.json';
import l02 from './chapter01/level02.json';
import l03 from './chapter01/level03.json';
import l04 from './chapter01/level04.json';
import l05 from './chapter01/level05.json';
import l06 from './chapter01/level06.json';
import l07 from './chapter01/level07.json';
import l08 from './chapter01/level08.json';
import l09 from './chapter01/level09.json';
import l10 from './chapter01/level10.json';
import tutorials from './tutorials.json';
import devCitadel from './dev/dev_citadel.json';
import devDragon from './dev/dev_dragon.json';
import devHold from './dev/dev_hold.json';
import devSpecials from './dev/dev_specials.json';
import devSurvive from './dev/dev_survive.json';
import devThree from './dev/dev_three.json';

// Levels are validated on load: a broken JSON fails fast in dev and in tests.
export const CHAPTERS: readonly (readonly LevelData[])[] = [
  loadChapter(1, [l01, l02, l03, l04, l05, l06, l07, l08, l09, l10]),
];

export const ALL_LEVELS: readonly LevelData[] = CHAPTERS.flat();

export const FIRST_LEVEL: LevelData = ALL_LEVELS[0]!;

/**
 * Sandbox levels for mechanics that no chapter uses yet (special nodes, goals, citadel, three sides, dragon).
 * Not part of the chapters; open in dev with ?level=<id>, e.g. ?level=dev_specials.
 */
export const DEV_LEVELS: readonly LevelData[] = [devSpecials, devHold, devSurvive, devCitadel, devThree, devDragon].map(loadLevel);

export const TUTORIALS: Readonly<Record<string, TutorialScript>> = tutorials as Record<string, TutorialScript>;

export function getLevel(id: string): LevelData | undefined {
  return ALL_LEVELS.find((l) => l.id === id) ?? DEV_LEVELS.find((l) => l.id === id);
}

/** The level after `id` in play order, or null after the last one. */
export function nextLevel(id: string): LevelData | null {
  const i = ALL_LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? (ALL_LEVELS[i + 1] ?? null) : null;
}
