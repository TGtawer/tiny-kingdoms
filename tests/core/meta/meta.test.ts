import { describe, expect, it } from 'vitest';
import { BONUSES, SPELLS, SPELL_UNLOCK_STARS, SPELL_UPGRADES } from '../../../src/config/balance';
import {
  currentLevel,
  defaultProgress,
  isChapterCompleted,
  isUnlocked,
  unlockedSpells,
  type Progress,
} from '../../../src/core/meta/Progress';
import { applyBattleResult, baseReward, rewardFor } from '../../../src/core/meta/rewards';
import { freeStars, totalStars } from '../../../src/core/meta/stars';
import {
  bonusCost,
  buyBonus,
  buySpellUpgrade,
  modifiersFrom,
  playerSetupFrom,
  spellUpgradeCost,
} from '../../../src/core/meta/upgrades';
import { spellCooldownMs } from '../../../src/core/sim/spells';
import { createWorld } from '../../../src/core/sim/World';
import { ALL_LEVELS } from '../../../src/levels';

const L = ALL_LEVELS;
const completeUpTo = (n: number): Progress => {
  const p = defaultProgress();
  p.completed = L.slice(0, n).map((l) => l.id);
  return p;
};

describe('level order', () => {
  it('only the first level is open at the start', () => {
    const p = defaultProgress();
    expect(isUnlocked(p, L, L[0]!.id)).toBe(true);
    expect(isUnlocked(p, L, L[1]!.id)).toBe(false);
    expect(currentLevel(p, L)?.id).toBe(L[0]!.id);
  });

  it('winning a level opens the next one; completed levels stay replayable', () => {
    const p = completeUpTo(3);
    expect(isUnlocked(p, L, L[0]!.id)).toBe(true);
    expect(isUnlocked(p, L, L[3]!.id)).toBe(true);
    expect(isUnlocked(p, L, L[4]!.id)).toBe(false);
    expect(currentLevel(p, L)?.id).toBe(L[3]!.id);
  });

  it('unknown levels are never unlocked', () => {
    expect(isUnlocked(completeUpTo(10), L, 'nope')).toBe(false);
  });
});

/** Progress with `n` stars earned, spread over fake level ids (3 per level). */
const withStars = (n: number): Progress => {
  const p = defaultProgress();
  for (let i = 0; n > 0; i++, n -= 3) p.stars[`l${i}`] = Math.min(3, n);
  return p;
};

describe('chapters', () => {
  it('chapter 1 counts as completed after its last level', () => {
    expect(isChapterCompleted(completeUpTo(9), L, 1)).toBe(false);
    expect(isChapterCompleted(completeUpTo(10), L, 1)).toBe(true);
  });
});

describe('spell unlocks by stars', () => {
  it('each spell opens at its total-stars threshold', () => {
    const fire = SPELL_UNLOCK_STARS.fireball;
    const reinf = SPELL_UNLOCK_STARS.reinforcement;
    expect(unlockedSpells(withStars(fire - 1))).toEqual([]);
    expect(unlockedSpells(withStars(fire))).toEqual(['fireball']);
    expect(unlockedSpells(withStars(reinf))).toEqual(['fireball', 'reinforcement']);
  });

  it('spending stars does not close a spell again', () => {
    const p = withStars(SPELL_UNLOCK_STARS.fireball);
    p.spentStars = totalStars(p);
    expect(freeStars(p)).toBe(0);
    expect(unlockedSpells(p)).toEqual(['fireball']);
  });
});

describe('rewards (BALANCE.md)', () => {
  const level = L[0]!;

  it('first victory gives 20 + 5 × chapter and completes the level', () => {
    const p = defaultProgress();
    expect(baseReward(level)).toBe(25);
    expect(applyBattleResult(p, level, 'victory')).toEqual({ crystals: 25, firstClear: true });
    expect(p.crystals).toBe(25);
    expect(p.completed).toEqual([level.id]);
  });

  it('a repeat victory gives 50%, a defeat 25%', () => {
    const p = completeUpTo(1);
    expect(rewardFor(p, level, 'victory')).toEqual({ crystals: 13, firstClear: false });
    expect(rewardFor(p, L[1]!, 'defeat')).toEqual({ crystals: 6, firstClear: false });
  });

  it('a defeat does not complete the level', () => {
    const p = defaultProgress();
    applyBattleResult(p, level, 'defeat');
    expect(p.completed).toEqual([]);
  });
});

describe('permanent bonuses', () => {
  it('cost round(50 × 1.35^(n−1)), 10 levels', () => {
    expect(bonusCost(0)).toBe(50);
    expect(bonusCost(1)).toBe(68);
    expect(bonusCost(9)).toBe(Math.round(50 * 1.35 ** 9));
    expect(bonusCost(BONUSES.maxLevel)).toBeNull();
  });

  it('buying spends crystals and raises the level', () => {
    const p = defaultProgress();
    p.crystals = 120;
    expect(buyBonus(p, 'goldIncome')).toBe('ok');
    expect(buyBonus(p, 'goldIncome')).toBe('ok');
    expect(p.bonuses.goldIncome).toBe(2);
    expect(p.crystals).toBe(120 - 50 - 68);
    expect(buyBonus(p, 'goldIncome')).toBe('notEnoughCrystals');
    p.crystals = 1e6;
    p.bonuses.goldIncome = BONUSES.maxLevel;
    expect(buyBonus(p, 'goldIncome')).toBe('maxLevel');
  });

  it('bonuses turn into battle modifiers', () => {
    const p = defaultProgress();
    p.bonuses = { startArmy: 3, troopProduction: 5, goldIncome: 2, unitStrength: 4 };
    const m = modifiersFrom(p);
    expect(m.troopProductionMult).toBeCloseTo(1.2);
    expect(m.goldIncomeMult).toBeCloseTo(1.1);
    expect(m.unitStrengthMult).toBeCloseTo(1.12);

    const world = createWorld(L[0]!, { player: playerSetupFrom(p) });
    const start = L[0]!.nodes.find((n) => n.owner === 'player')!;
    expect(world.nodes[start.id]!.troops).toBe(start.troops + 6);
  });
});

describe('spell upgrades', () => {
  it('cost 2, 3, 4, 5, 6 stars, 5 levels', () => {
    expect([0, 1, 2, 3, 4].map(spellUpgradeCost)).toEqual([2, 3, 4, 5, 6]);
    expect(spellUpgradeCost(SPELL_UPGRADES.maxLevel)).toBeNull();
  });

  it('locked until the spell is open', () => {
    const p = withStars(SPELL_UNLOCK_STARS.fireball - 1);
    expect(buySpellUpgrade(p, 'fireball')).toBe('locked');
    p.stars.extra = 1;
    expect(buySpellUpgrade(p, 'fireball')).toBe('ok');
    expect(buySpellUpgrade(p, 'reinforcement')).toBe('locked');
  });

  it('spends free stars, not crystals', () => {
    const p = withStars(SPELL_UNLOCK_STARS.fireball + 2);
    p.crystals = 1000;
    expect(buySpellUpgrade(p, 'fireball')).toBe('ok');
    expect(p.crystals).toBe(1000);
    expect(p.spentStars).toBe(2);
    expect(freeStars(p)).toBe(SPELL_UNLOCK_STARS.fireball);
    expect(buySpellUpgrade(p, 'fireball')).toBe('ok');
    expect(buySpellUpgrade(p, 'fireball')).toBe('notEnoughStars');
    expect(p.spellUpgrades.fireball).toBe(2);
  });

  it('fireball: +5% damage and −1 s cooldown per level', () => {
    const p = defaultProgress();
    p.spellUpgrades.fireball = 2;
    const m = modifiersFrom(p);
    expect(m.spells.fireball.killShareBonus).toBeCloseTo(0.1);
    expect(spellCooldownMs('fireball', m)).toBe((SPELLS.fireball.cooldownSec - 2) * 1000);
  });

  it('reinforcement: +3 troops and −1 s cooldown per level', () => {
    const p = defaultProgress();
    p.spellUpgrades.reinforcement = 3;
    const m = modifiersFrom(p);
    expect(m.spells.reinforcement.extraTroops).toBe(9);
    expect(spellCooldownMs('reinforcement', m)).toBe((SPELLS.reinforcement.cooldownSec - 3) * 1000);
  });
});
