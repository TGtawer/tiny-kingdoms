import { describe, expect, it } from 'vitest';
import { defaultProgress, type Progress } from '../../../src/core/meta/Progress';
import { featureLevel, isFeatureAvailable, isGoldVisible, isUpgradesOpen, learnByBuilding } from '../../../src/core/meta/unlocks';
import { playerSetupFrom } from '../../../src/core/meta/upgrades';
import { parseSave, serializeSave, defaultSave } from '../../../src/core/save/SaveData';
import { ALL_LEVELS } from '../../../src/levels';

const L = ALL_LEVELS;
const id = (n: number): string => `c01_l${String(n).padStart(2, '0')}`;
/** Fresh save with levels 1..n won. */
const wonUpTo = (n: number): Progress => {
  const p = defaultProgress();
  p.completed = Array.from({ length: n }, (_, i) => id(i + 1));
  return p;
};

describe('buildings open by use (PLAYTEST-1 F-5)', () => {
  it('before it is built on its lesson, a building is locked everywhere except on that lesson', () => {
    for (const p of [defaultProgress(), wonUpTo(4), wonUpTo(9)]) {
      p.learned = [];
      for (let n = 1; n <= 10; n++) {
        expect(isFeatureAvailable('barracks', id(n), p, L), `barracks on ${n}`).toBe(n === 3);
        expect(isFeatureAvailable('tower', id(n), p, L), `tower on ${n}`).toBe(n === 5);
      }
    }
  });

  it('winning level 4 does not open the tower: replaying level 1 keeps it locked', () => {
    const p = wonUpTo(4);
    p.learned = ['barracks'];
    expect(isFeatureAvailable('tower', id(1), p, L)).toBe(false);
    expect(isFeatureAvailable('barracks', id(1), p, L)).toBe(true);
  });

  it('building it on its lesson opens it in every battle; elsewhere building teaches nothing', () => {
    const p = defaultProgress();
    expect(learnByBuilding(p, 'tower', id(4))).toBe(false);
    expect(p.learned).toEqual([]);
    expect(learnByBuilding(p, 'tower', id(5))).toBe(true);
    expect(learnByBuilding(p, 'tower', id(5))).toBe(false);
    expect(p.learned).toEqual(['tower']);
    for (let n = 1; n <= 10; n++) expect(isFeatureAvailable('tower', id(n), p, L)).toBe(true);
  });

  it('a learned building survives the save right after it is built (leaving the battle keeps it)', () => {
    const save = defaultSave();
    learnByBuilding(save.progress, 'barracks', id(3));
    expect(parseSave(serializeSave(save)).progress.learned).toEqual(['barracks']);
  });

  it('an unlocked spell goes into every battle, early levels included', () => {
    const p = wonUpTo(6);
    p.unlockedSpells = ['reinforcement'];
    p.activeSpell = 'reinforcement';
    // The battle setup does not depend on the level: replaying level 1 has the spell too.
    expect(playerSetupFrom(p).unlockedSpells).toEqual(['reinforcement']);
  });

  it('the mine is learned in chapter 2, so it is never open in chapter 1', () => {
    expect(isFeatureAvailable('mine', id(10), wonUpTo(10), L)).toBe(false);
  });

  it('dev sandbox levels have everything open', () => {
    const p = defaultProgress();
    for (const f of ['barracks', 'tower', 'mine'] as const) expect(isFeatureAvailable(f, 'dev_specials', p, L)).toBe(true);
    expect(isGoldVisible('dev_specials', p, L)).toBe(true);
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

describe('gold counter (PLAYTEST-1 F-5)', () => {
  it('is hidden on levels 1–2 of a fresh save and shown on a building lesson', () => {
    expect(isGoldVisible(id(1), defaultProgress(), L)).toBe(false);
    expect(isGoldVisible(id(2), wonUpTo(1), L)).toBe(false);
    expect(isGoldVisible(id(3), wonUpTo(2), L)).toBe(true);
    expect(isGoldVisible(id(5), wonUpTo(4), L)).toBe(true);
  });

  it('is shown in every battle once a building is learned or a spell is unlocked', () => {
    const learned = wonUpTo(2);
    expect(isGoldVisible(id(1), learned, L)).toBe(false);
    learned.learned = ['barracks'];
    expect(isGoldVisible(id(1), learned, L)).toBe(true);
    const p = defaultProgress();
    p.unlockedSpells = ['reinforcement'];
    expect(isGoldVisible(id(1), p, L)).toBe(true);
  });
});
