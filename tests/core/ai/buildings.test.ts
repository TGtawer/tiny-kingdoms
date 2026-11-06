import { describe, expect, it } from 'vitest';
import { aiStep, createAi } from '../../../src/core/ai/EnemyAI';
import { createWorld } from '../../../src/core/sim/World';
import { level, node, placeUnit } from '../helpers';

/** The first decision of an enemy AI on this world. */
function decide(world: ReturnType<typeof createWorld>, aggression = 1) {
  world.tick = 10;
  const ai = createAi('enemy', { thinkMs: 100, aggression });
  ai.nextThinkTick = 10;
  return aiStep(world, ai);
}

describe('AI values buildings (PLAYTEST-1 F-3: a captured building changes owner intact)', () => {
  it('attacks a node with a building before an equal node without one', () => {
    const world = createWorld(
      level(
        [
          node('E', 0.5, 0.2, { owner: 'enemy', size: 'large', troops: 30 }),
          node('A', 0.3, 0.6, { owner: 'player', troops: 4 }),
          node('B', 0.7, 0.6, { owner: 'player', troops: 4, building: { type: 'barracks', level: 2 } }),
          node('P', 0.5, 0.95, { owner: 'player', troops: 1 }),
        ],
        [
          ['E', 'A'],
          ['E', 'B'],
          ['A', 'P'],
          ['B', 'P'],
        ],
      ),
    );
    const firstTarget = decide(world).find((c) => c.type === 'send');
    expect(firstTarget).toMatchObject({ from: 'E', to: 'B' });
  });

  it('with one helper for two threatened nodes, defends the one with a building', () => {
    const world = createWorld(
      level(
        [
          node('P', 0.5, 0.95, { owner: 'player', troops: 1 }),
          node('A', 0.3, 0.6, { owner: 'enemy', troops: 1 }),
          node('B', 0.7, 0.6, { owner: 'enemy', troops: 1, building: { type: 'tower', level: 1 } }),
          node('H', 0.5, 0.45, { owner: 'enemy', troops: 9 }),
        ],
        [
          ['P', 'A'],
          ['P', 'B'],
          ['A', 'H'],
          ['B', 'H'],
        ],
      ),
    );
    // The same attack on both nodes, 3 s away; H can save only one of them.
    for (let i = 0; i < 8; i++) {
      placeUnit(world, 'player', ['P', 'A'], 0.05);
      placeUnit(world, 'player', ['P', 'B'], 0.05);
    }
    const helps = decide(world, 0).filter((c) => c.type === 'send' && c.from === 'H');
    expect(helps.map((c) => (c.type === 'send' ? c.to : ''))).toEqual(['B']);
  });
});
