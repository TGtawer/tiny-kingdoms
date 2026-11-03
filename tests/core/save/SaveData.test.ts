import { describe, expect, it } from 'vitest';
import { BONUSES } from '../../../src/config/balance';
import { defaultSave, newerSave, parseSave, SAVE_VERSION, serializeSave, type Migration } from '../../../src/core/save/SaveData';

describe('parseSave', () => {
  it('round-trips a save', () => {
    const save = defaultSave(123);
    save.progress.crystals = 77;
    save.progress.completed = ['c01_l01', 'c01_l02'];
    save.progress.bonuses.goldIncome = 3;
    expect(parseSave(serializeSave(save))).toEqual(save);
  });

  it.each([null, undefined, '', 'not json', '[]', 42, '{"version":1,"progress":"x"}'])('turns garbage (%s) into a fresh save', (raw) => {
    const save = parseSave(raw);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.progress.crystals).toBe(0);
    expect(save.progress.completed).toEqual([]);
  });

  it('fills missing fields and drops bad values', () => {
    const save = parseSave({
      version: 1,
      updatedAt: 5,
      progress: {
        crystals: -10,
        completed: ['a', 'a', 7, 'b'],
        bonuses: { goldIncome: 99, unitStrength: 'x', startArmy: 2.7 },
      },
    });
    expect(save.updatedAt).toBe(5);
    expect(save.progress.crystals).toBe(0);
    expect(save.progress.completed).toEqual(['a', 'b']);
    expect(save.progress.bonuses).toEqual({ startArmy: 2, troopProduction: 0, goldIncome: BONUSES.maxLevel, unitStrength: 0 });
    expect(save.progress.spellUpgrades).toEqual({ fireball: 0, reinforcement: 0 });
  });

  it('runs migrations from older versions', () => {
    // A hypothetical version-0 save that stored crystals at the top level.
    const v0toV1: Migration = (d) => ({ ...d, version: 1, progress: { crystals: d.gems } });
    const save = parseSave({ version: 0, updatedAt: 9, gems: 40 }, { 0: v0toV1 });
    expect(save.progress.crystals).toBe(40);
    expect(save.version).toBe(SAVE_VERSION);
  });
});

describe('settings (v2)', () => {
  it('a v1 save gets default settings', () => {
    const save = parseSave({ version: 1, updatedAt: 1, progress: { crystals: 5 } });
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.settings).toEqual({ sound: true });
    expect(save.progress.crystals).toBe(5);
  });

  it('keeps a stored sound setting and drops bad values', () => {
    expect(parseSave({ version: 2, settings: { sound: false } }).settings.sound).toBe(false);
    expect(parseSave({ version: 2, settings: { sound: 'no' } }).settings.sound).toBe(true);
  });
});

describe('newerSave', () => {
  it('prefers the one with the larger updatedAt', () => {
    const a = defaultSave(100);
    const b = defaultSave(200);
    expect(newerSave(a, b)).toBe(b);
    expect(newerSave(b, a)).toBe(b);
    expect(newerSave(null, a)).toBe(a);
    expect(newerSave(a, null)).toBe(a);
    expect(newerSave(null, null)).toBeNull();
  });
});
