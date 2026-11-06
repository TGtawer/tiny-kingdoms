import { BUILDING_TYPES, FEATURE_UNLOCKS, type BuildingType } from '../../config/balance';
import type { LevelData } from '../level/schema';
import type { Progress } from './Progress';

/**
 * What the player can use, so nothing appears before it is taught (TUTORIAL.md T-3, PLAYTEST-1 F-5).
 * A building opens by use: once the player has built it on its lesson (FEATURE_UNLOCKS[b].learnOn) it is in
 * `progress.learned` and open in every battle; until then it is available only on that lesson. The Upgrades screen
 * opens after a win. Spells are not here: an unlocked spell works in every battle (spellbook.ts).
 * Levels outside `levels` (dev sandboxes) have everything open.
 */

export type Feature = BuildingType | 'upgrades';

/** The lesson level of a building. */
export function lessonOf(building: BuildingType): string {
  return FEATURE_UNLOCKS[building].learnOn;
}

export function isLearned(progress: Progress, building: BuildingType): boolean {
  return progress.learned.includes(building);
}

/**
 * Whether the player can use `feature` in a battle on `levelId`: a learned building everywhere, a building not
 * learned yet only on its lesson (any playthrough of that level, so it can always still be learned).
 * TODO(F-6): on the lesson, only when the tutorial step asks for it (the lesson gate decides).
 */
export function isFeatureAvailable(feature: Feature, levelId: string, progress: Progress, levels: readonly LevelData[]): boolean {
  if (feature === 'upgrades') return isUpgradesOpen(progress);
  if (!levels.some((l) => l.id === levelId)) return true;
  return isLearned(progress, feature) || levelId === lessonOf(feature);
}

/**
 * The player built `building` on `levelId`: on its lesson this opens it everywhere. Returns true when it was newly
 * learned (the caller saves at once — leaving or losing the battle keeps it).
 */
export function learnByBuilding(progress: Progress, building: BuildingType, levelId: string): boolean {
  if (levelId !== lessonOf(building) || isLearned(progress, building)) return false;
  progress.learned.push(building);
  return true;
}

/** The Upgrades screen opens after the first win on FEATURE_UNLOCKS.upgrades.afterWin. */
export function isUpgradesOpen(progress: Progress): boolean {
  return progress.completed.includes(FEATURE_UNLOCKS.upgrades.afterWin);
}

/** The level a building opens on, for the "opens at level N" hint; null if no such level exists yet. */
export function featureLevel(feature: BuildingType, levels: readonly LevelData[]): LevelData | null {
  return levels.find((l) => l.id === lessonOf(feature)) ?? null;
}

/**
 * The gold counter is shown only once there is something to spend gold on: a learned building, an unlocked spell,
 * or this battle is a building's lesson. Gold is still earned while hidden.
 */
export function isGoldVisible(levelId: string, progress: Progress, levels: readonly LevelData[]): boolean {
  if (progress.learned.length > 0 || progress.unlockedSpells.length > 0) return true;
  // Dev sandboxes have every building open.
  if (!levels.some((l) => l.id === levelId)) return true;
  return BUILDING_TYPES.some((b) => lessonOf(b) === levelId);
}
