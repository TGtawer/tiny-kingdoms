import { describe, expect, it } from 'vitest';
import { defaultProgress, type Progress } from '../../../src/core/meta/Progress';
import { featureLevel, isFeatureAvailable, isGoldVisible, isUpgradesOpen } from '../../../src/core/meta/unlocks';
import { ALL_LEVELS } from '../../../src/levels';

const L = ALL_LEVELS;
const id = (n: number): string => `c01_l${String(n).padStart(2, '0')}`;
/** Fresh save with levels 1..n won. */
const wonUpTo = (n: number): Progress => {
  const p = defaultProgress();
  p.completed = Array.from({ length: n }, (_, i) => id(i + 1));
  return p;
};

describe('buildings open level by level (TUTORIAL.md T-3)', () => {
  it('first playthrough: barracks from level 3, tower from level 5', () => {
    for (let n = 1; n <= 10; n++) {
      const p = wonUpTo(n - 1);
      expect(isFeatureAvailable('barracks', id(n), p, L), `barracks on ${n}`).toBe(n >= 3);
      expect(isFeatureAvailable('tower', id(n), p, L), `tower on ${n}`).toBe(n >= 5);
    }
  });

  it('replaying an early level keeps what the player has reached', () => {
    const p = wonUpTo(4); // the next level to win is 5
    expect(isFeatureAvailable('barracks', id(1), p, L)).toBe(true);
    expect(isFeatureAvailable('tower', id(1), p, L)).toBe(true);
    expect(isFeatureAvailable('tower', id(1), wonUpTo(3), L)).toBe(false);
  });

  it('the mine opens in chapter 2, so never in chapter 1', () => {
    expect(isFeatureAvailable('mine', id(10), wonUpTo(10), L)).toBe(false);
  });

  it('dev sandbox levels have everything open', () => {
    const p = defaultProgress();
    for (const f of ['barracks', 'tower', 'mine'] as const) expect(isFeatureAvailable(f, 'dev_specials', p, L)).toBe(true);
  });

  it('names the level a building opens on', () => {
    expect(featureLevel('barracks', L)?.index).toBe(3);
    expect(featureLevel('tower', L)?.index).toBe(5);
    expect(featureLevel('mine', L)).toBeNull();
  });
});

describe('Upgrades screen', () => {
  it('opens after the first win on level 6', () => {
    expect(isUpgradesOpen(wonUpTo(5))).toBe(false);
    expect(isUpgradesOpen(wonUpTo(6))).toBe(true);
    expect(isFeatureAvailable('upgrades', id(7), wonUpTo(6), L)).toBe(true);
  });
});

describe('gold counter', () => {
  it('is hidden on levels 1–2 of a fresh save and shown from level 3', () => {
    expect(isGoldVisible(id(1), defaultProgress(), L)).toBe(false);
    expect(isGoldVisible(id(2), wonUpTo(1), L)).toBe(false);
    expect(isGoldVisible(id(3), wonUpTo(2), L)).toBe(true);
  });

  it('is shown when replaying level 1 later, and whenever a spell is unlocked', () => {
    expect(isGoldVisible(id(1), wonUpTo(2), L)).toBe(true);
    const p = defaultProgress();
    p.unlockedSpells = ['reinforcement'];
    expect(isGoldVisible(id(1), p, L)).toBe(true);
  });
});
