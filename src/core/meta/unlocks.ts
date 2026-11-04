import { FEATURE_UNLOCKS, type BuildingType } from '../../config/balance';
import type { LevelData } from '../level/schema';
import type { Progress } from './Progress';

/**
 * TUTORIAL.md T-3: what the player can use, so nothing appears before it is taught.
 * Buildings open at a level in play order; the Upgrades screen after a win. Levels outside `levels`
 * (dev sandboxes) have everything open.
 */

export type Feature = BuildingType | 'upgrades';

/**
 * How far the player has got, as an index into `levels`: the larger of the level being played
 * and the next level not won yet. Replaying level 1 after reaching level 5 counts as level 5.
 */
function reach(levelId: string, progress: Progress, levels: readonly LevelData[]): number {
  const current = levels.findIndex((l) => l.id === levelId);
  const next = levels.findIndex((l) => !progress.completed.includes(l.id));
  return Math.max(current, next === -1 ? levels.length - 1 : next);
}

/** Whether the player can use `feature` in a battle on `levelId`. */
export function isFeatureAvailable(feature: Feature, levelId: string, progress: Progress, levels: readonly LevelData[]): boolean {
  if (feature === 'upgrades') return isUpgradesOpen(progress);
  if (!levels.some((l) => l.id === levelId)) return true;
  const at = levels.findIndex((l) => l.id === FEATURE_UNLOCKS[feature]);
  return at >= 0 && at <= reach(levelId, progress, levels);
}

/** The Upgrades screen opens after the first win on FEATURE_UNLOCKS.upgrades.afterWin. */
export function isUpgradesOpen(progress: Progress): boolean {
  return progress.completed.includes(FEATURE_UNLOCKS.upgrades.afterWin);
}

/** The level a building opens on, for the "opens at level N" hint; null if no such level exists yet. */
export function featureLevel(feature: BuildingType, levels: readonly LevelData[]): LevelData | null {
  return levels.find((l) => l.id === FEATURE_UNLOCKS[feature]) ?? null;
}

/**
 * The gold counter is shown only once there is something to spend gold on: any building or an unlocked spell.
 * Gold is still earned while hidden.
 */
export function isGoldVisible(levelId: string, progress: Progress, levels: readonly LevelData[]): boolean {
  const buildings: readonly BuildingType[] = ['barracks', 'tower', 'mine'];
  return progress.unlockedSpells.length > 0 || buildings.some((b) => isFeatureAvailable(b, levelId, progress, levels));
}
