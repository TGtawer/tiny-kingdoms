import { describe, expect, it } from 'vitest';
import { TICK_MS, TUTORIAL } from '../../../src/config/balance';
import { aiParamsFromLevel, aiStep, createAi } from '../../../src/core/ai/EnemyAI';
import { defaultProgress } from '../../../src/core/meta/Progress';
import { unlockSpell } from '../../../src/core/meta/spellbook';
import { playerSetupFrom } from '../../../src/core/meta/upgrades';
import { step } from '../../../src/core/sim/tick';
import { createWorld, type World } from '../../../src/core/sim/World';
import {
  advanceTutorial,
  currentStep,
  isTutorialSlow,
  startTutorial,
  type StepCondition,
  type TutorialScript,
} from '../../../src/core/tutorial/tutorial';
import { CHAPTERS, TUTORIALS } from '../../../src/levels';
import { freezeEconomy, lineWorld } from '../helpers';

/**
 * The player does not have to follow the hints in order (bug: level 3, barracks built during the gold hint,
 * then the battle stayed slowed down for the rest of the level). A step whose goal is already reached in the
 * world must not keep the battle waiting.
 */

/** Goal of a step that can be read from the world (independent of when it happened); null: an event-only goal. */
function goalInWorld(until: StepCondition, world: World): boolean | null {
  switch (until.type) {
    case 'build':
      return Object.values(world.nodes).some(
        (n) =>
          n.owner === 'player' &&
          n.building !== null &&
          (!until.building || n.building.type === until.building) &&
          (!until.node || n.id === until.node),
      );
    case 'capture':
      return until.node ? world.nodes[until.node]?.owner === 'player' : null;
    default:
      return null;
  }
}

describe('hints done out of order (TUTORIAL.md T-4)', () => {
  it('barracks built during an earlier hint: the barracks steps are skipped', () => {
    const world = freezeEconomy(lineWorld({}, { playerStartGold: 100 }));
    const script: TutorialScript = {
      steps: [
        { hint: 'tut.gold', until: { type: 'time', sec: 3 } },
        { hint: 'tut.tapCastle', until: { type: 'select', node: 'P' }, slow: true },
        { hint: 'tut.buildBarracks', until: { type: 'build', building: 'barracks' }, slow: true },
        { hint: 'tut.barracks', until: { type: 'time', sec: 4 } },
      ],
    };
    const t = startTutorial(script, world.tick);
    advanceTutorial(t, world, step(world, [{ type: 'build', side: 'player', nodeId: 'P', building: 'barracks' }]));
    // Still in the gold hint (a time step runs its course), but nothing ahead may wait for the barracks.
    for (let i = 0; i < 40; i++) advanceTutorial(t, world, step(world));
    expect(currentStep(t)?.hint).toBe('tut.barracks');
    expect(isTutorialSlow(t, world.tick)).toBe(false);
  });

  it('a node captured before its step: the capture step is skipped', () => {
    const world = freezeEconomy(lineWorld({ N: { owner: 'player' } }));
    const script: TutorialScript = {
      steps: [
        { hint: 'tut.swipe', until: { type: 'capture', node: 'N' }, slow: true },
        { hint: 'tut.goal', until: { type: 'time', sec: 4 } },
      ],
    };
    const t = startTutorial(script, world.tick);
    advanceTutorial(t, world, step(world));
    expect(currentStep(t)?.hint).toBe('tut.goal');
  });

  it('a slow step that the player ignores stops slowing the battle after TUTORIAL.slowMaxSec; the hint stays', () => {
    const world = freezeEconomy(lineWorld());
    const t = startTutorial({ steps: [{ hint: 'tut.tapSpell', until: { type: 'spellSelect' }, slow: true }] }, world.tick);
    const limit = Math.round((TUTORIAL.slowMaxSec * 1000) / TICK_MS);
    for (let i = 0; i < limit - 1; i++) advanceTutorial(t, world, step(world));
    expect(isTutorialSlow(t, world.tick)).toBe(true);
    for (let i = 0; i < 2; i++) advanceTutorial(t, world, step(world));
    expect(isTutorialSlow(t, world.tick)).toBe(false);
    expect(currentStep(t)?.hint).toBe('tut.tapSpell');
  });

  it.each(CHAPTERS[0]!.filter((l) => l.tutorial).map((l) => [l.id, l] as const))(
    '%s: an AI that ignores the hints is slowed down at most TUTORIAL.slowMaxSec per step',
    (_id, level) => {
      const limit = Math.round((TUTORIAL.slowMaxSec * 1000) / TICK_MS);
      for (const seed of [1, 2, 3]) {
        const progress = defaultProgress();
        unlockSpell(progress, 'reinforcement');
        const world = createWorld(level, { seed, player: playerSetupFrom(progress) });
        const t = startTutorial(TUTORIALS[level.tutorial!]!, world.tick);
        const player = createAi('player', { thinkMs: 1200, aggression: 0.6 });
        const enemy = createAi('enemy', aiParamsFromLevel(level.enemy, world.goal, world.capitals.player));
        const slowed = new Map<number, number>();
        while (!world.winner && world.tick < 6000) {
          advanceTutorial(t, world, step(world, [...aiStep(world, player), ...aiStep(world, enemy)]));
          if (isTutorialSlow(t, world.tick)) slowed.set(t.index, (slowed.get(t.index) ?? 0) + 1);
        }
        for (const [index, ticks] of slowed) expect(ticks, `${level.id} seed ${seed} step ${index + 1}`).toBeLessThanOrEqual(limit);
      }
    },
  );

  it.each(CHAPTERS[0]!.filter((l) => l.tutorial).map((l) => [l.id, l] as const))(
    '%s: an AI that ignores the hints is never slowed down by a step whose goal is already reached',
    (_id, level) => {
      for (const seed of [1, 2, 3]) {
        // The spell lesson needs reinforcement in hand, as after the Upgrades tour.
        const progress = defaultProgress();
        unlockSpell(progress, 'reinforcement');
        const world = createWorld(level, { seed, player: playerSetupFrom(progress) });
        const t = startTutorial(TUTORIALS[level.tutorial!]!, world.tick);
        const player = createAi('player', { thinkMs: 1200, aggression: 0.6 });
        const enemy = createAi('enemy', aiParamsFromLevel(level.enemy, world.goal, world.capitals.player));
        while (!world.winner && world.tick < 6000) {
          advanceTutorial(t, world, step(world, [...aiStep(world, player), ...aiStep(world, enemy)]));
          const current = currentStep(t);
          if (current && isTutorialSlow(t, world.tick)) {
            // Neither this step's goal nor a later one may already be reached: the lesson is moot then.
            const ahead = t.script.steps.slice(t.index);
            const reached = ahead.find((s) => goalInWorld(s.until, world) === true);
            expect(reached, `${level.id} seed ${seed} tick ${world.tick}: slowed on ${current.hint}, already done: ${reached?.hint}`).toBeUndefined();
          }
        }
      }
    },
  );
});
