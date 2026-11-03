import { describe, expect, it } from 'vitest';
import {
  advanceTutorial,
  currentStep,
  startTutorial,
  validateTutorial,
  type StepCondition,
  type TutorialScript,
} from '../../../src/core/tutorial/tutorial';
import { step } from '../../../src/core/sim/tick';
import { hasKey } from '../../../src/i18n/i18n';
import { ALL_LEVELS, TUTORIALS } from '../../../src/levels';
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

describe('chapter tutorials', () => {
  it('every tutorial referenced by a level exists and matches it', () => {
    for (const level of ALL_LEVELS.filter((l) => l.tutorial)) {
      const tutorial = TUTORIALS[level.tutorial!];
      expect(tutorial, level.id).toBeDefined();
      expect(validateTutorial(tutorial!, level, hasKey)).toEqual([]);
    }
  });
});
