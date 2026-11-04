import { describe, expect, it } from 'vitest';
import { advanceTour, claimTourSpell, tourLevel, tourScene, tourStep } from '../../../src/core/meta/onboarding';
import { defaultProgress, type Progress } from '../../../src/core/meta/Progress';
import { activeSpell } from '../../../src/core/meta/spellbook';
import { parseSave, serializeSave, defaultSave } from '../../../src/core/save/SaveData';

const id = (n: number): string => `c01_l${String(n).padStart(2, '0')}`;
const wonUpTo = (n: number): Progress => {
  const p = defaultProgress();
  p.completed = Array.from({ length: n }, (_, i) => id(i + 1));
  return p;
};

describe('Upgrades tour (TUTORIAL.md T-6)', () => {
  it('starts after the first win on level 6', () => {
    expect(tourLevel()).toBe('c01_l06');
    expect(tourStep(wonUpTo(5))).toBeNull();
    expect(tourStep(wonUpTo(6))).toBe(1);
  });

  it('goes map → crystals → spells → claim → back, then is done', () => {
    const p = wonUpTo(6);
    expect(tourScene(1)).toBe('ChapterMapScene');
    expect(advanceTour(p, 1)).toBe(true);
    expect(tourStep(p)).toBe(2);
    expect(tourScene(2)).toBe('UpgradesScene');
    expect(advanceTour(p, 2)).toBe(true);
    expect(advanceTour(p, 3)).toBe(true);
    expect(tourStep(p)).toBe(4);
    // Step 4 ends only by claiming the spell.
    expect(advanceTour(p, 4)).toBe(false);
    expect(claimTourSpell(p)).toBe(true);
    expect(p.unlockedSpells).toEqual(['reinforcement']);
    expect(activeSpell(p)).toBe('reinforcement');
    expect(tourStep(p)).toBe(5);
    expect(advanceTour(p, 5)).toBe(true);
    expect(tourStep(p)).toBeNull();
    expect(p.onboarding.upgradesTour).toBe('done');
  });

  it('only the current step can be finished', () => {
    const p = wonUpTo(6);
    expect(advanceTour(p, 3)).toBe(false);
    expect(claimTourSpell(p)).toBe(false);
    expect(tourStep(p)).toBe(1);
    expect(advanceTour(wonUpTo(5), 1)).toBe(false);
  });

  it('the claimed spell becomes active even if another one was active', () => {
    const p = wonUpTo(6);
    p.unlockedSpells = ['fireball'];
    p.activeSpell = 'fireball';
    p.onboarding.upgradesTour = 4;
    claimTourSpell(p);
    expect(activeSpell(p)).toBe('reinforcement');
  });

  it('step 4 with the spell already in hand moves on to the last step', () => {
    const p = wonUpTo(6);
    p.onboarding.upgradesTour = 4;
    p.unlockedSpells = ['reinforcement'];
    expect(tourStep(p)).toBe(5);
  });

  it('continues from the saved step after a reload', () => {
    const save = defaultSave(1);
    save.progress = wonUpTo(6);
    advanceTour(save.progress, 1);
    advanceTour(save.progress, 2);
    const loaded = parseSave(serializeSave(save));
    expect(tourStep(loaded.progress)).toBe(3);
  });
});

describe('save v8', () => {
  it('players who already won level 6 count the tour as done; others start pending', () => {
    expect(parseSave({ version: 7, progress: { completed: [id(1), id(6)] } }).progress.onboarding.upgradesTour).toBe('done');
    expect(parseSave({ version: 7, progress: { completed: [id(1)] } }).progress.onboarding.upgradesTour).toBe('pending');
  });

  it('drops a broken tour state', () => {
    expect(parseSave({ version: 8, progress: { onboarding: { upgradesTour: 9 } } }).progress.onboarding.upgradesTour).toBe('pending');
    expect(parseSave({ version: 8, progress: { onboarding: { upgradesTour: 3 } } }).progress.onboarding.upgradesTour).toBe(3);
  });
});
