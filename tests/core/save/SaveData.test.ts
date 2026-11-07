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
    expect(save.progress.spellUpgrades).toEqual({ fireball: 0, reinforcement: 0, shield: 0 });
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
    expect(save.settings).toEqual({ sound: true, music: true, soundVolume: 1, musicVolume: 1, lang: null });
    expect(save.progress.crystals).toBe(5);
  });

  it('keeps a stored sound setting and drops bad values', () => {
    expect(parseSave({ version: 2, settings: { sound: false } }).settings.sound).toBe(false);
    expect(parseSave({ version: 2, settings: { sound: 'no' } }).settings.sound).toBe(true);
  });
});

describe('spent stars (v4)', () => {
  it('a v3 save starts with nothing spent', () => {
    const save = parseSave({ version: 3, updatedAt: 1, progress: { stars: { a: 3 } } });
    expect(save.progress.spentStars).toBe(0);
  });

  it('spent stars are clamped to 0..earned', () => {
    expect(parseSave({ version: 7, progress: { stars: { a: 3, b: 2 }, spentStars: 99 } }).progress.spentStars).toBe(5);
    expect(parseSave({ version: 7, progress: { stars: { a: 3 }, spentStars: -4 } }).progress.spentStars).toBe(0);
  });
});

describe('story spells (v7, TUTORIAL.md T-3)', () => {
  it('drops slot choices and gives back the stars spent on spell upgrades', () => {
    const save = parseSave({
      version: 6,
      progress: {
        stars: { a: 3, b: 3, c: 3, d: 3 },
        openSpells: ['fireball', 'shield'],
        activeSpell: 'shield',
        spellUpgrades: { fireball: 2, shield: 1 },
        spentStars: 7,
      },
    });
    expect(save.progress.unlockedSpells).toEqual([]);
    expect(save.progress.activeSpell).toBeNull();
    expect(save.progress.spellUpgrades).toEqual({ fireball: 0, reinforcement: 0, shield: 0 });
    expect(save.progress.spentStars).toBe(0);
    expect(save.progress.stars).toEqual({ a: 3, b: 3, c: 3, d: 3 });
  });

  it('unlocks what the story has already given: reinforcement after level 6, fireball after level 10', () => {
    const upTo = (n: number): string[] => Array.from({ length: n }, (_, i) => `c01_l${String(i + 1).padStart(2, '0')}`);
    expect(parseSave({ version: 6, progress: { completed: upTo(5) } }).progress.unlockedSpells).toEqual([]);
    const six = parseSave({ version: 6, progress: { completed: upTo(6) } }).progress;
    expect(six.unlockedSpells).toEqual(['reinforcement']);
    expect(six.activeSpell).toBe('reinforcement');
    expect(parseSave({ version: 6, progress: { completed: upTo(10) } }).progress.unlockedSpells).toEqual(['reinforcement', 'fireball']);
  });

  it('drops unknown spells and fixes a bad active spell', () => {
    const save = parseSave({ version: 7, progress: { unlockedSpells: ['meteor', 'reinforcement', 'reinforcement'], activeSpell: 'fireball' } });
    expect(save.progress.unlockedSpells).toEqual(['reinforcement']);
    expect(save.progress.activeSpell).toBe('reinforcement');
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

describe('music setting (v6)', () => {
  it('a v5 save gets music on and keeps its sound setting', () => {
    const save = parseSave({ version: 5, settings: { sound: false } });
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.settings).toEqual({ sound: false, music: true, soundVolume: 1, musicVolume: 1, lang: null });
  });

  it('keeps a stored music setting and drops bad values', () => {
    expect(parseSave({ version: 6, settings: { sound: true, music: false } }).settings.music).toBe(false);
    expect(parseSave({ version: 6, settings: { music: 1 } }).settings.music).toBe(true);
  });
});

describe('buildings learned by use (v9, PLAYTEST-1 F-5)', () => {
  it('a won lesson counts as learned: level 3 → barracks, level 5 → tower', () => {
    expect(parseSave({ version: 8, progress: { completed: ['c01_l01', 'c01_l02'] } }).progress.learned).toEqual([]);
    expect(parseSave({ version: 8, progress: { completed: ['c01_l01', 'c01_l02', 'c01_l03', 'c01_l04'] } }).progress.learned).toEqual(['barracks']);
    const all = parseSave({ version: 8, progress: { completed: ['c01_l03', 'c01_l05', 'c01_l06'] } });
    expect(all.version).toBe(SAVE_VERSION);
    expect(all.progress.learned).toEqual(['barracks', 'tower']);
  });

  it('keeps only known buildings, once each', () => {
    expect(parseSave({ version: 9, progress: { learned: ['tower', 'tower', 'castle', 3] } }).progress.learned).toEqual(['tower']);
  });
});

describe('volumes and language (v10, settings panel)', () => {
  it('a v9 save keeps its sound and music switches and gets full volumes and the platform language', () => {
    const save = parseSave({ version: 9, settings: { sound: false, music: false } });
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.settings).toEqual({ sound: false, music: false, soundVolume: 1, musicVolume: 1, lang: null });
  });

  it('keeps stored volumes and language', () => {
    const save = parseSave({ version: 10, settings: { sound: true, music: false, soundVolume: 0.25, musicVolume: 0.6, lang: 'en' } });
    expect(save.settings).toEqual({ sound: true, music: false, soundVolume: 0.25, musicVolume: 0.6, lang: 'en' });
  });

  it('clamps bad volumes and drops an unknown language', () => {
    const save = parseSave({ version: 10, settings: { soundVolume: 3, musicVolume: 'loud', lang: 'de' } });
    expect(save.settings.soundVolume).toBe(1);
    expect(save.settings.musicVolume).toBe(1);
    expect(save.settings.lang).toBeNull();
    expect(parseSave({ version: 10, settings: { soundVolume: -1 } }).settings.soundVolume).toBe(0);
  });

  it('the volumes and the language survive a save round trip', () => {
    const save = defaultSave(5);
    save.settings.soundVolume = 0.4;
    save.settings.lang = 'ru';
    const back = parseSave(serializeSave(save));
    expect(back.settings.soundVolume).toBe(0.4);
    expect(back.settings.lang).toBe('ru');
  });
});
