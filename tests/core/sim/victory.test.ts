import { describe, expect, it } from 'vitest';
import { validate } from '../../../src/core/sim/commands';
import { step, type TickEvent } from '../../../src/core/sim/tick';
import { checkWinner } from '../../../src/core/sim/victory';
import { createWorld } from '../../../src/core/sim/World';
import { freezeEconomy, level, lineWorld, node, run } from '../helpers';

describe('victory and defeat', () => {
  it('no winner while both sides own nodes', () => {
    expect(checkWinner(lineWorld())).toBeNull();
  });

  it('player wins when the enemy has no nodes, neutrals may remain', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 40 }, E: { troops: 3 } }));
    world.nodes.N!.owner = 'player';
    world.nodes.N!.troops = 0;
    const events: TickEvent[] = [...step(world, [{ type: 'send', side: 'player', from: 'P', to: 'E' }])];
    while (!world.winner && world.tick < 200) events.push(...step(world));
    expect(world.winner).toBe('player');
    expect(events).toContainEqual({ type: 'gameOver', winner: 'player' });
  });

  it('neutral nodes do not need to be captured', () => {
    const world = lineWorld({ E: { owner: 'neutral' } });
    expect(checkWinner(world)).toBe('player');
  });

  it('enemy wins when the player has no nodes, even with a player army on the road', () => {
    // F(enemy) — P(player) — E(enemy, close to P).
    const world = freezeEconomy(
      createWorld(
        level(
          [
            node('F', 0, 0.5, { owner: 'enemy', troops: 50 }),
            node('P', 0.5, 0.5, { owner: 'player', troops: 4 }),
            node('E', 0.6, 0.5, { owner: 'enemy', troops: 40 }),
          ],
          [
            ['F', 'P'],
            ['P', 'E'],
          ],
        ),
      ),
    );
    step(world, [
      { type: 'send', side: 'player', from: 'P', to: 'F' },
      { type: 'send', side: 'enemy', from: 'E', to: 'P' },
    ]);
    run(world, 20);
    expect(world.armies.some((a) => a.owner === 'player')).toBe(true);
    expect(world.nodes.P!.owner).toBe('enemy');
    expect(world.winner).toBe('enemy');
  });

  it('after game over, ticks do nothing and commands are rejected', () => {
    const world = lineWorld();
    world.winner = 'player';
    const before = structuredClone(world);
    expect(step(world, [{ type: 'send', side: 'player', from: 'P', to: 'N' }])).toEqual([]);
    expect(world).toEqual(before);
    expect(validate(world, { type: 'send', side: 'player', from: 'P', to: 'N' })).toBe('gameOver');
  });
});
