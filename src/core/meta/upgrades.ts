import { BONUSES, SPELL_UPGRADES, type SpellId } from '../../config/balance';
import { defaultModifiers, type PlayerSetup, type SideModifiers } from '../sim/World';
import { unlockedSpells, type BonusId, type Progress } from './Progress';
import { freeStars } from './stars';

// TODO(design): GDD 4.3 lists a spell cost upgrade, but BALANCE.md has no numbers for it yet.

/** Cost of buying level `n` (1-based): round(base × growth^(n−1)). */
function levelCost(base: number, growth: number, n: number): number {
  return Math.round(base * growth ** (n - 1));
}

export function bonusCost(currentLevel: number): number | null {
  if (currentLevel >= BONUSES.maxLevel) return null;
  return levelCost(BONUSES.costBase, BONUSES.costGrowth, currentLevel + 1);
}

/** Stars for the next spell level, or null at max. */
export function spellUpgradeCost(currentLevel: number): number | null {
  if (currentLevel >= SPELL_UPGRADES.maxLevel) return null;
  return SPELL_UPGRADES.starCosts[currentLevel] ?? null;
}

export type BuyResult = 'ok' | 'maxLevel' | 'notEnoughCrystals' | 'notEnoughStars' | 'locked';

export function buyBonus(progress: Progress, bonus: BonusId): BuyResult {
  const cost = bonusCost(progress.bonuses[bonus]);
  if (cost === null) return 'maxLevel';
  if (progress.crystals < cost) return 'notEnoughCrystals';
  progress.crystals -= cost;
  progress.bonuses[bonus] += 1;
  return 'ok';
}

/** Spell upgrades are bought with stars, once the spell itself is open. */
export function buySpellUpgrade(progress: Progress, spell: SpellId): BuyResult {
  if (!unlockedSpells(progress).includes(spell)) return 'locked';
  const cost = spellUpgradeCost(progress.spellUpgrades[spell]);
  if (cost === null) return 'maxLevel';
  if (freeStars(progress) < cost) return 'notEnoughStars';
  progress.spentStars += cost;
  progress.spellUpgrades[spell] += 1;
  return 'ok';
}

/** Battle modifiers from permanent bonuses and spell upgrades. */
export function modifiersFrom(progress: Progress): SideModifiers {
  const b = progress.bonuses;
  const s = progress.spellUpgrades;
  const per = BONUSES.perLevel;
  const spell = SPELL_UPGRADES.perLevel;
  const mods = defaultModifiers();
  mods.troopProductionMult = 1 + per.troopProduction * b.troopProduction;
  mods.goldIncomeMult = 1 + per.goldIncome * b.goldIncome;
  mods.unitStrengthMult = 1 + per.unitStrength * b.unitStrength;
  mods.spells.fireball.killShareBonus = spell.fireball.damageShare * s.fireball;
  mods.spells.fireball.cooldownReductionSec = -spell.fireball.cooldownSec * s.fireball;
  mods.spells.reinforcement.extraTroops = spell.reinforcement.troops * s.reinforcement;
  mods.spells.reinforcement.cooldownReductionSec = -spell.reinforcement.cooldownSec * s.reinforcement;
  return mods;
}

/** Everything a battle needs from meta progression for the player side. */
export function playerSetupFrom(progress: Progress): PlayerSetup {
  return {
    modifiers: modifiersFrom(progress),
    startArmyBonus: BONUSES.perLevel.startArmy * progress.bonuses.startArmy,
    unlockedSpells: unlockedSpells(progress),
  };
}
