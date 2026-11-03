import { describe, expect, it } from 'vitest';
import { AI, BUILDINGS, TICK_MS } from '../../../src/config/balance';
import { aiParamsFromLevel, aiStep, createAi, type AiParams } from '../../../src/core/ai/EnemyAI';
import { validate, type Command } from '../../../src/core/sim/commands';
import { step } from '../../../src/core/sim/tick';
import { createWorld, type World } from '../../../src/core/sim/World';
import { ALL_LEVELS } from '../../../src/levels';
import { freezeEconomy, level, lineWorld, node } from '../helpers';

const params = (aggression = 0.5, thinkMs = 1000): AiParams => ({ thinkMs, aggression });

/** Runs the enemy AI's next decision immediately. */
function decide(world: World, p: AiParams = params()): Command[] {
  const ai = createAi('enemy', p);
  ai.nextThinkTick = world.tick;
  return aiStep(world, ai);
}

const sends = (cmds: Command[]) => cmds.filter((c) => c.type === 'send');

describe('decision timing', () => {
  it('thinks only every thinkMs (with jitter)', () => {
    const world = lineWorld({ E: { troops: 30 } });
    const ai = createAi('enemy', params(0.5, 1000));
    const interval = 1000 / TICK_MS;
    expect(ai.nextThinkTick).toBe(interval);

    for (let i = 0; i < interval; i++) {
      expect(aiStep(world, ai)).toEqual([]);
      step(world);
    }
    expect(aiStep(world, ai).length).toBeGreaterThan(0);
    const next = ai.nextThinkTick - world.tick;
    expect(next).toBeGreaterThanOrEqual(Math.floor(interval * (1 - AI.thinkJitter)));
    expect(next).toBeLessThanOrEqual(Math.ceil(interval * (1 + AI.thinkJitter)));
    expect(aiStep(world, ai)).toEqual([]);
  });

  it('waits for aiStartDelayMs before the first decision', () => {
    const ai = createAi('enemy', aiParamsFromLevel({ productionMult: 1, aiThinkMs: 1000, aggression: 0.5, startGold: 0, aiStartDelayMs: 5000 }));
    expect(ai.nextThinkTick).toBe(5000 / TICK_MS);
  });

  it('does nothing after the battle is over', () => {
    const world = lineWorld({ E: { troops: 30 } });
    world.winner = 'player';
    expect(decide(world)).toEqual([]);
  });
});

describe('attack', () => {
  it('attacks a weak neutral when its armies beat the defense with margin', () => {
    const world = freezeEconomy(lineWorld({ E: { troops: 30 }, N: { troops: 5 } }));
    expect(sends(decide(world))).toEqual([{ type: 'send', side: 'enemy', from: 'E', to: 'N' }]);
  });

  it('does not attack when it cannot win', () => {
    const world = freezeEconomy(lineWorld({ E: { troops: 30 }, N: { troops: 20 } }));
    expect(sends(decide(world))).toEqual([]);
  });

  it('cautious AI needs a bigger advantage than an aggressive one', () => {
    // E sends 15. N = 9: cautious needs 9 × 1.6 + 2 = 16.4, aggressive 9 × 1.1 + 2 = 11.9.
    const cautious = freezeEconomy(lineWorld({ E: { troops: 30 }, N: { troops: 9 } }));
    const aggressive = freezeEconomy(lineWorld({ E: { troops: 30 }, N: { troops: 9 } }));
    expect(sends(decide(cautious, params(0)))).toEqual([]);
    expect(sends(decide(aggressive, params(1)))).toHaveLength(1);
  });

  it('combines several nodes for one attack', () => {
    // E1 and E2 send 10 each; neither alone beats N (12 troops), together they do. P is out of reach.
    const world = freezeEconomy(
      createWorld(
        level(
          [
            node('P', 0, 0.5, { owner: 'player', troops: 60 }),
            node('N', 0.4, 0.5, { troops: 12 }),
            node('E1', 0.6, 0.4, { owner: 'enemy', troops: 20 }),
            node('E2', 0.6, 0.6, { owner: 'enemy', troops: 20 }),
          ],
          [
            ['P', 'N'],
            ['N', 'E1'],
            ['N', 'E2'],
          ],
        ),
      ),
    );
    const cmds = sends(decide(world, params(1)));
    expect(cmds.map((c) => c.from).sort()).toEqual(['E1', 'E2']);
    expect(cmds.every((c) => c.to === 'N')).toBe(true);
  });
});

describe('economy', () => {
  it('builds a mine on its gold vein first', () => {
    const world = lineWorld({ E: { hasGoldVein: true } }, { enemy: { productionMult: 1, aiThinkMs: 1000, aggression: 0.5, startGold: BUILDINGS.cost[0] } });
    expect(decide(world)).toContainEqual({ type: 'build', side: 'enemy', nodeId: 'E', building: 'mine' });
  });

  it('upgrades buildings when everything is built', () => {
    const world = lineWorld(
      { E: { hasGoldVein: true, building: { type: 'mine', level: 1 } } },
      { enemy: { productionMult: 1, aiThinkMs: 1000, aggression: 0.5, startGold: BUILDINGS.cost[1] } },
    );
    expect(decide(world)).toContainEqual({ type: 'upgrade', side: 'enemy', nodeId: 'E' });
  });

  it('does not spend gold it does not have', () => {
    const world = lineWorld({ E: { hasGoldVein: true } }, { enemy: { productionMult: 1, aiThinkMs: 1000, aggression: 0.5, startGold: BUILDINGS.cost[0] - 1 } });
    expect(decide(world).filter((c) => c.type !== 'send')).toEqual([]);
  });
});

describe('defense', () => {
  it('reinforces a node that an incoming army would capture', () => {
    // P(player, far) — N(enemy, weak) — E(enemy, close helper).
    const world = freezeEconomy(
      createWorld(
        level(
          [
            node('P', 0, 0.5, { owner: 'player', troops: 40 }),
            node('N', 0.5, 0.5, { owner: 'enemy', troops: 2 }),
            node('E', 0.6, 0.5, { owner: 'enemy', troops: 30 }),
          ],
          [
            ['P', 'N'],
            ['N', 'E'],
          ],
        ),
      ),
    );
    step(world, [{ type: 'send', side: 'player', from: 'P', to: 'N' }]);
    expect(sends(decide(world))).toContainEqual({ type: 'send', side: 'enemy', from: 'E', to: 'N' });
  });
});

/** Both sides played by the AI. Returns the finished world. */
function aiVsAi(levelIndex: number, seed: number, maxTicks: number): { world: World; invalid: number } {
  const data = ALL_LEVELS[levelIndex]!;
  const world = createWorld(data, { seed });
  const player = createAi('player', params(0.5, 1500));
  const enemy = createAi('enemy', aiParamsFromLevel(data.enemy));
  let invalid = 0;
  while (!world.winner && world.tick < maxTicks) {
    const cmds = [...aiStep(world, player), ...aiStep(world, enemy)];
    invalid += cmds.filter((c) => validate(world, c) !== null).length;
    step(world, cmds);
  }
  return { world, invalid };
}

describe('AI vs AI smoke test', () => {
  // 15 minutes of game time is far beyond the 1–3 minute target; a draw here means the AI is stuck.
  const MAX_TICKS = (15 * 60 * 1000) / TICK_MS;

  describe.each(ALL_LEVELS.map((l, i) => [l.id, i] as const))('level %s', (_id, index) => {
    it.each([1, 2, 3, 4, 5])('seed %i: battle ends, AI issues only valid commands', (seed) => {
      const { world, invalid } = aiVsAi(index, seed, MAX_TICKS);
      expect(world.winner).not.toBeNull();
      expect(invalid).toBe(0);
    });
  });

  it('is deterministic for the same seed', () => {
    const a = aiVsAi(0, 7, 3000).world;
    const b = aiVsAi(0, 7, 3000).world;
    expect(a).toEqual(b);
  });
});
