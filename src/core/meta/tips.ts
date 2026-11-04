import { BONUS_IDS, type Progress } from './Progress';
import { bonusCost } from './upgrades';

/** What the defeat tip needs to know about the lost battle. */
export interface DefeatSummary {
  builtBarracks: boolean;
  builtMine: boolean;
  /** At some point the player owned a gold-vein node without a mine on it. */
  hadVeinWithoutMine: boolean;
}

/** What the player has been taught so far (unlocks.ts): tips only suggest open things (TUTORIAL.md T-3). */
export interface TipAvailability {
  barracks: boolean;
  mine: boolean;
  upgrades: boolean;
}

/** i18n key suffix of the tip (`tip.<id>`); 'upgrades' also offers the Upgrades button. */
export type DefeatTip = 'barracks' | 'mine' | 'upgrades';

/** Whether any permanent bonus can be bought with the crystals the player has. */
export function canBuyUpgrade(progress: Progress): boolean {
  return BONUS_IDS.some((id) => {
    const cost = bonusCost(progress.bonuses[id]);
    return cost !== null && progress.crystals >= cost;
  });
}

/** One tip for the defeat screen, by simple rules in priority order; null when none applies. */
export function defeatTip(summary: DefeatSummary, progress: Progress, available: TipAvailability): DefeatTip | null {
  if (available.barracks && !summary.builtBarracks) return 'barracks';
  if (available.mine && summary.hadVeinWithoutMine && !summary.builtMine) return 'mine';
  if (available.upgrades && canBuyUpgrade(progress)) return 'upgrades';
  return null;
}
