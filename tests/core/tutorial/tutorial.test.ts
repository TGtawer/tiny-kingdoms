import { describe, expect, it } from 'vitest';
import { TUTORIAL } from '../../../src/config/balance';
import { defaultProgress } from '../../../src/core/meta/Progress';
import {
  advanceTutorial,
  currentStep,
  runClock,
  shouldRunTutorial,
  startTutorial,
  tutorialSpeed,
  validateTutorial,
  type StepCondition,
  type TutorialScript,
} from '../../../src/core/tutorial/tutorial';
import { step } from '../../../src/core/sim/tick';
import { hasKey } from '../../../src/i18n/i18n';
import { ALL_LEVELS, DEV_LEVELS, TUTORIALS } from '../../../src/levels';
import { freezeEconomy, lineWorld, run } from '../helpers';

const script = (...until: StepCondition[]): TutorialScript => ({ steps: until.map((u) => ({ hint: 'tut.send', until: u })) });

describe('tutorial steps', () => {
  it('send: advances when the player sends an army', () => {
    const world = freezeEconomy(lineWorld());
    const t = startTutorial(script({ type: 'send' }, { type: 'time', sec: 1 }), world.tick);
    expect(advanceTutorial(t, world, step(world))).toBe(false);
    // Enemy sends don't count.
    expect(advanceTutorial(t, world, step(world, [{ type: 'send', side: 'enemy', from: 'E', to: 'N' }]))).toBe(false);
    expect(advanceTutorial(t, world, step(world, [{ type: 'send', side: 'player', from: 'P', to: 'N' }]))).toBe(true);
    expect(t.index).toBe(1);
  });

  it('capture: only player captures (of the given node)', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 40 } }));
    const t = startTutorial(script({ type: 'capture', node: 'N' }), world.tick);
    let done = advanceTutorial(t, world, step(world, [{ type: 'send', side: 'player', from: 'P', to: 'N' }]));
    for (let i = 0; i < 60 && !done; i++) done = advanceTutorial(t, world, step(world));
    expect(done).toBe(true);
    expect(world.nodes.N!.owner).toBe('player');
    expect(currentStep(t)).toBeNull();
  });

  it('build: matches the building type', () => {
    const world = freezeEconomy(lineWorld({}, { playerStartGold: 200 }));
    const t = startTutorial(script({ type: 'build', building: 'barracks' }), world.tick);
    expect(advanceTutorial(t, world, step(world, [{ type: 'build', side: 'player', nodeId: 'P', building: 'tower' }]))).toBe(false);
    world.nodes.N!.owner = 'player';
    expect(advanceTutorial(t, world, step(world, [{ type: 'build', side: 'player', nodeId: 'N', building: 'barracks' }]))).toBe(true);
  });

  it('gold: waits until the player has enough', () => {
    const world = lineWorld({}, { playerStartGold: 0 });
    const t = startTutorial(script({ type: 'gold', atLeast: 1 }), world.tick);
    expect(advanceTutorial(t, world, step(world))).toBe(false);
    run(world, 40);
    expect(advanceTutorial(t, world, [])).toBe(true);
  });

  it('time: counts from the start of the step', () => {
    const world = lineWorld();
    const t = startTutorial(script({ type: 'time', sec: 2 }), world.tick);
    run(world, 19);
    expect(advanceTutorial(t, world, [])).toBe(false);
    run(world, 1);
    expect(advanceTutorial(t, world, [])).toBe(true);
  });

  it('select: UI event for the build menu', () => {
    const world = lineWorld();
    const t = startTutorial(script({ type: 'select', node: 'P' }), world.tick);
    expect(advanceTutorial(t, world, [], [{ type: 'select', node: 'N' }])).toBe(false);
    expect(advanceTutorial(t, world, [], [{ type: 'select', node: 'P' }])).toBe(true);
  });

  it('send minSources: one swipe through at least two own nodes', () => {
    const world = freezeEconomy(lineWorld({ N: { owner: 'player', troops: 10 }, E: { troops: 1 } }));
    const t = startTutorial(script({ type: 'send', minSources: 2 }), world.tick);
    expect(advanceTutorial(t, world, step(world, [{ type: 'send', side: 'player', from: 'P', to: 'E' }]))).toBe(false);
    // Two sources but two different targets is not one swipe.
    expect(
      advanceTutorial(t, world, step(world, [
        { type: 'send', side: 'player', from: 'P', to: 'N' },
        { type: 'send', side: 'player', from: 'N', to: 'E' },
      ])),
    ).toBe(false);
    world.nodes.P!.troops = 20;
    world.nodes.N!.troops = 20;
    expect(
      advanceTutorial(t, world, step(world, [
        { type: 'send', side: 'player', from: 'P', to: 'E' },
        { type: 'send', side: 'player', from: 'N', to: 'E' },
      ])),
    ).toBe(true);
  });

  it('spellSelect (UI) and cast', () => {
    const world = freezeEconomy(lineWorld({}, { playerStartGold: 200 }));
    world.sides.player.unlockedSpells = ['reinforcement'];
    const t = startTutorial(script({ type: 'spellSelect' }, { type: 'cast', spell: 'reinforcement' }), world.tick);
    expect(advanceTutorial(t, world, [], [{ type: 'select', node: 'P' }])).toBe(false);
    expect(advanceTutorial(t, world, [], [{ type: 'spellSelect', spell: 'reinforcement' }])).toBe(true);
    expect(advanceTutorial(t, world, step(world))).toBe(false);
    expect(advanceTutorial(t, world, step(world, [{ type: 'cast', side: 'player', spell: 'reinforcement', nodeId: 'P' }]))).toBe(true);
  });

  it('any: done when one of the conditions is', () => {
    const world = freezeEconomy(lineWorld());
    const t = startTutorial(script({ type: 'any', of: [{ type: 'select', node: 'N' }, { type: 'send' }] }), world.tick);
    expect(advanceTutorial(t, world, step(world))).toBe(false);
    expect(advanceTutorial(t, world, step(world, [{ type: 'send', side: 'player', from: 'P', to: 'N' }]))).toBe(true);
  });

  it('a step without text still waits for its condition', () => {
    const world = freezeEconomy(lineWorld());
    const t = startTutorial({ steps: [{ until: { type: 'send' } }, { hint: 'tut.goal', until: { type: 'time', sec: 1 } }] }, world.tick);
    expect(currentStep(t)?.hint).toBeUndefined();
    expect(advanceTutorial(t, world, step(world))).toBe(false);
    expect(advanceTutorial(t, world, step(world, [{ type: 'send', side: 'player', from: 'P', to: 'N' }]))).toBe(true);
    expect(currentStep(t)?.hint).toBe('tut.goal');
  });

  it('validateTutorial reports unknown nodes and texts', () => {
    const level = ALL_LEVELS[0]!;
    const bad: TutorialScript = {
      steps: [{ hint: 'tut.nope', finger: { kind: 'drag', from: 'player', to: 'ghost' }, until: { type: 'send' } }],
    };
    const errors = validateTutorial(bad, level, hasKey);
    expect(errors.some((e) => e.includes('ghost'))).toBe(true);
    expect(errors.some((e) => e.includes('tut.nope'))).toBe(true);
  });
});

describe('slow-down (TUTORIAL.md T-4)', () => {
  const slowScript: TutorialScript = {
    steps: [
      { hint: 'tut.goal', until: { type: 'send' }, slow: true },
      { hint: 'tut.goal', until: { type: 'time', sec: 1 } },
    ],
  };

  it('a slow step runs the battle at TUTORIAL.slowMo; the next step at full speed', () => {
    const world = freezeEconomy(lineWorld());
    const t = startTutorial(slowScript, world.tick);
    expect(tutorialSpeed(t)).toBe(TUTORIAL.slowMo);
    advanceTutorial(t, world, step(world, [{ type: 'send', side: 'player', from: 'P', to: 'N' }]));
    expect(tutorialSpeed(t)).toBe(1);
    expect(tutorialSpeed(null)).toBe(1);
  });

  it('fewer ticks per frame while slow', () => {
    const count = (speed: number): number => {
      let ticks = 0;
      let acc = 0;
      for (let frame = 0; frame < 60; frame++) acc = runClock(acc, 1000 / 60, () => speed, () => ++ticks > 0);
      return ticks;
    };
    expect(count(1)).toBe(10);
    expect(count(TUTORIAL.slowMo)).toBe(2);
  });

  it('the speed is re-read every tick: finishing the step mid-frame speeds the rest of the frame up', () => {
    let speed: number = TUTORIAL.slowMo;
    let ticks = 0;
    // One tick needs 500 ms of real time at 0.2; after it the step is done and the rest runs at ×1.
    const acc = runClock(0, 1000, () => speed, () => {
      ticks++;
      speed = 1;
      return true;
    });
    expect(ticks).toBe(1 + 5);
    expect(acc).toBeCloseTo(0, 6);
  });

  it('validateTutorial: a time step cannot be slow and lasts at most TUTORIAL.infoStepMaxSec', () => {
    const level = ALL_LEVELS[0]!;
    const errors = validateTutorial(
      { steps: [{ hint: 'tut.goal', until: { type: 'time', sec: TUTORIAL.infoStepMaxSec + 1 }, slow: true }] },
      level,
      hasKey,
    );
    expect(errors.some((e) => e.includes('cannot be slow'))).toBe(true);
    expect(errors.some((e) => e.includes('longer than'))).toBe(true);
  });
});

describe('first playthrough only', () => {
  it('runs the tutorial only while the level is not won yet', () => {
    const level = ALL_LEVELS[0]!;
    const script = TUTORIALS[level.tutorial!];
    const progress = defaultProgress();
    expect(shouldRunTutorial(level, progress, script)).toBe(true);
    progress.completed.push(level.id);
    expect(shouldRunTutorial(level, progress, script)).toBe(false);
    expect(shouldRunTutorial({ ...level, tutorial: undefined }, defaultProgress(), script)).toBe(false);
  });

  it('the spell lesson (level 7) runs only with reinforcement as the active spell', () => {
    const level = ALL_LEVELS[6]!;
    const script = TUTORIALS[level.tutorial!];
    const progress = defaultProgress();
    expect(shouldRunTutorial(level, progress, script)).toBe(false);
    progress.unlockedSpells = ['reinforcement', 'fireball'];
    progress.activeSpell = 'fireball';
    expect(shouldRunTutorial(level, progress, script)).toBe(false);
    progress.activeSpell = 'reinforcement';
    expect(shouldRunTutorial(level, progress, script)).toBe(true);
  });
});

describe('chapter tutorials', () => {
  it('every tutorial referenced by a level exists and matches it', () => {
    for (const level of [...ALL_LEVELS, ...DEV_LEVELS].filter((l) => l.tutorial)) {
      const tutorial = TUTORIALS[level.tutorial!];
      expect(tutorial, level.id).toBeDefined();
      expect(validateTutorial(tutorial!, level, hasKey)).toEqual([]);
    }
  });
});
