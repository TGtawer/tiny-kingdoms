import { describe, expect, it } from 'vitest';
import { aiParamsFromLevel, aiStep, createAi } from '../../../src/core/ai/EnemyAI';
import type { Command } from '../../../src/core/sim/commands';
import { step } from '../../../src/core/sim/tick';
import { createWorld, isAttacked, type World } from '../../../src/core/sim/World';
import { ALL_LEVELS, DEV_LEVELS } from '../../../src/levels';
import { level, node, placeUnit } from '../helpers';

/** Sends that would cancel a running stream (a re-swipe) or come from an attacked node. */
function jerks(world: World, commands: readonly Command[]): number {
  let n = 0;
  for (const c of commands) {
    if (c.type !== 'send') continue;
    const from = world.nodes[c.from]!;
    if (from.streams > 0 || isAttacked(world, from)) n++;
  }
  return n;
}

describe('AI with stream armies (ROADMAP P-3)', () => {
  it.each([...ALL_LEVELS, ...DEV_LEVELS].map((l) => [l.id, l] as const))(
    '%s: AI vs AI ends; no AI re-swipes a running stream or sends from an attacked node',
    (_id, lvl) => {
      const world = createWorld(lvl, { seed: 3 });
      const ais = [createAi('player', { thinkMs: 1200, aggression: 0.6 }), createAi('enemy', aiParamsFromLevel(lvl.enemy, world.goal, world.capitals.player))];
      if (lvl.enemy2) ais.push(createAi('enemy2', aiParamsFromLevel(lvl.enemy2)));
      let bad = 0;
      let sends = 0;
      while (!world.winner && world.tick < 9000) {
        const commands = ais.flatMap((ai) => aiStep(world, ai));
        bad += jerks(world, commands);
        sends += commands.filter((c) => c.type === 'send').length;
        step(world, commands);
      }
      expect(world.winner, `${lvl.id} did not finish`).not.toBeNull();
      expect(sends).toBeGreaterThan(0);
      expect(bad).toBe(0);
    },
  );
});

describe('AI defense counts stream release time', () => {
  it('calls a second helper when only part of the first stream arrives before the attack', () => {
    const world = createWorld(
      level(
        [
          node('P', 0.1, 0.5, { owner: 'player', troops: 5 }),
          node('T', 0.5, 0.5, { owner: 'enemy', troops: 1 }),
          node('A', 0.62, 0.5, { owner: 'enemy', troops: 20 }),
          node('B', 0.5, 0.62, { owner: 'enemy', troops: 20 }),
        ],
        [
          ['P', 'T'],
          ['T', 'A'],
          ['T', 'B'],
        ],
      ),
    );
    // 14 player units 3 s away from T. A's stream of 15 is 1 s away, but only 11 of them get there in time.
    for (let i = 0; i < 14; i++) placeUnit(world, 'player', ['P', 'T'], 0.1);
    world.tick = 10;
    const ai = createAi('enemy', { thinkMs: 100, aggression: 0 });
    ai.nextThinkTick = 10;
    const helpers = aiStep(world, ai)
      .filter((c) => c.type === 'send' && c.to === 'T')
      .map((c) => (c.type === 'send' ? c.from : ''));
    expect(helpers.sort()).toEqual(['A', 'B']);
  });
});
