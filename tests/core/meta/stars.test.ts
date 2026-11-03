import { describe, expect, it } from 'vitest';
import { BONUSES, STARS } from '../../../src/config/balance';
import { defaultProgress } from '../../../src/core/meta/Progress';
import { bestStars, recordStars, starsFor, starTimeSec } from '../../../src/core/meta/stars';
import { canBuyUpgrade, defeatTip } from '../../../src/core/meta/tips';
import { parseSave } from '../../../src/core/save/SaveData';
import { level, node } from '../helpers';

const lvl = level([node('p', 0.1, 0.5, { owner: 'player' }), node('e', 0.9, 0.5, { owner: 'enemy' })], [['p', 'e']]);
const fast = (STARS.defaultTimeSec - 1) * 1000;
const slow = (STARS.defaultTimeSec + 1) * 1000;

describe('starsFor', () => {
  it('defeat gives no stars', () => {
    expect(starsFor({ won: false, timeMs: 0, lostOwnNode: false }, lvl)).toBe(0);
  });

  it.each([
    [fast, false, 3],
    [fast, true, 2],
    [slow, false, 2],
    [slow, true, 1],
  ])('victory in %i ms, lost a node: %s -> %i stars', (timeMs, lostOwnNode, expected) => {
    expect(starsFor({ won: true, timeMs, lostOwnNode }, lvl)).toBe(expected);
  });

  it('uses the level time when set', () => {
    const custom = { ...lvl, starTimeSec: 60 };
    expect(starTimeSec(custom)).toBe(60);
    expect(starsFor({ won: true, timeMs: 61_000, lostOwnNode: false }, custom)).toBe(2);
    expect(starsFor({ won: true, timeMs: 60_000, lostOwnNode: false }, custom)).toBe(3);
  });
});

describe('recordStars', () => {
  it('keeps the best result only', () => {
    const p = defaultProgress();
    expect(recordStars(p, 'a', 2)).toBe(true);
    expect(recordStars(p, 'a', 1)).toBe(false);
    expect(bestStars(p, 'a')).toBe(2);
    expect(recordStars(p, 'a', 3)).toBe(true);
    expect(bestStars(p, 'a')).toBe(3);
    expect(bestStars(p, 'b')).toBe(0);
  });

  it('survives a save round-trip and drops bad values', () => {
    const save = parseSave({ version: 3, progress: { stars: { a: 3, b: 9, c: 'x', d: 0 } } });
    expect(save.progress.stars).toEqual({ a: 3, b: STARS.max });
    expect(parseSave({ version: 2, progress: {} }).progress.stars).toEqual({});
  });
});

describe('defeatTip', () => {
  const all = { builtBarracks: true, builtMine: true, hadVeinWithoutMine: true };

  it('suggests barracks first', () => {
    expect(defeatTip({ ...all, builtBarracks: false }, defaultProgress())).toBe('barracks');
  });

  it('then a mine on an unused gold vein', () => {
    expect(defeatTip({ ...all, builtMine: false }, defaultProgress())).toBe('mine');
    expect(defeatTip({ ...all, builtMine: false, hadVeinWithoutMine: false }, defaultProgress())).toBeNull();
  });

  it('then upgrades when the player can afford one', () => {
    const p = defaultProgress();
    expect(canBuyUpgrade(p)).toBe(false);
    expect(defeatTip(all, p)).toBeNull();
    p.crystals = BONUSES.costBase;
    expect(canBuyUpgrade(p)).toBe(true);
    expect(defeatTip(all, p)).toBe('upgrades');
  });
});
