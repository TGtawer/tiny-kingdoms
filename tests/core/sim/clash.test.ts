import { describe, expect, it } from 'vitest';
import { ARMY } from '../../../src/config/balance';
import { step, type TickEvent } from '../../../src/core/sim/tick';
import { createWorld, type World } from '../../../src/core/sim/World';
import { freezeEconomy, level, node } from '../helpers';

/** P(player) — E(enemy), one road of length 0.8. Sends use the AI `pull` mode (50%). */
function duel(playerTroops: number, enemyTroops: number): World {
  return freezeEconomy(
    createWorld(
      level(
        [node('P', 0.1, 0.5, { owner: 'player', troops: playerTroops }), node('E', 0.9, 0.5, { owner: 'enemy', troops: enemyTroops })],
        [['P', 'E']],
      ),
    ),
  );
}

const sendBoth = [
  { type: 'send', side: 'player', from: 'P', to: 'E', mode: 'pull' },
  { type: 'send', side: 'enemy', from: 'E', to: 'P', mode: 'pull' },
] as const;

/** Runs until the first clash; returns it and the tick it happened on. */
function untilClash(world: World): { clash: Extract<TickEvent, { type: 'clash' }>; tick: number } {
  let events = step(world, [...sendBoth]);
  for (let i = 0; i < 200; i++) {
    const clash = events.find((e): e is Extract<TickEvent, { type: 'clash' }> => e.type === 'clash');
    if (clash) return { clash, tick: world.tick };
    events = step(world);
  }
  throw new Error('no clash');
}

describe('road clashes', () => {
  it('armies meeting head-on fight: the stronger survives minus the weaker', () => {
    const world = duel(20, 8); // sends 10 vs 4
    const { clash } = untilClash(world);
    expect(world.armies).toHaveLength(1);
    expect(world.armies[0]).toMatchObject({ owner: 'player', count: 6 });
    expect(clash.survivorId).toBe(world.armies[0]!.id);
  });

  it('they meet in the middle of the road, about half the travel time', () => {
    const world = duel(20, 20);
    const { clash, tick } = untilClash(world);
    expect(clash.x).toBeCloseTo(0.5, 1);
    const half = 0.4 / ARMY.speed / 0.1;
    expect(Math.abs(tick - half)).toBeLessThanOrEqual(2);
  });

  it('equal armies destroy each other', () => {
    const world = duel(20, 20);
    const { clash } = untilClash(world);
    expect(clash.survivorId).toBeNull();
    expect(world.armies).toHaveLength(0);
  });

  it('the survivor keeps marching to its target', () => {
    const world = duel(20, 8);
    untilClash(world);
    for (let i = 0; i < 100 && world.armies.length; i++) step(world);
    // 6 survivors hit E (4 left after sending): E is captured with 2.
    expect(world.nodes.E).toMatchObject({ owner: 'player', troops: 2 });
  });

  it('unit strength scales the clash like a node battle', () => {
    const world = duel(20, 20); // 10 vs 10
    world.sides.player.modifiers.unitStrengthMult = 1.5;
    untilClash(world);
    expect(world.armies[0]!.owner).toBe('player');
    expect(world.armies[0]!.count).toBeCloseTo(10 / 3);
  });

  it('same-side armies pass through each other', () => {
    const world = freezeEconomy(
      createWorld(
        level(
          [
            node('A', 0.1, 0.5, { owner: 'player', troops: 20 }),
            node('B', 0.9, 0.5, { owner: 'player', troops: 20 }),
            node('E', 0.9, 0.1, { owner: 'enemy', troops: 5 }),
          ],
          [
            ['A', 'B'],
            ['B', 'E'],
          ],
        ),
      ),
    );
    step(world, [
      { type: 'send', side: 'player', from: 'A', to: 'B', mode: 'pull' },
      { type: 'send', side: 'player', from: 'B', to: 'A', mode: 'pull' },
    ]);
    for (let i = 0; i < 80; i++) expect(step(world).some((e) => e.type === 'clash')).toBe(false);
    expect(world.nodes.A!.troops).toBe(20);
    expect(world.nodes.B!.troops).toBe(20);
  });

  it('armies on different roads do not clash', () => {
    // P and E both attack neutral N from different sides.
    const world = freezeEconomy(
      createWorld(
        level(
          [
            node('P', 0.1, 0.5, { owner: 'player', troops: 20 }),
            node('N', 0.5, 0.5, { troops: 0 }),
            node('E', 0.9, 0.5, { owner: 'enemy', troops: 20 }),
          ],
          [
            ['P', 'N'],
            ['N', 'E'],
          ],
        ),
      ),
    );
    const events: TickEvent[] = [
      ...step(world, [
        { type: 'send', side: 'player', from: 'P', to: 'N', mode: 'pull' },
        { type: 'send', side: 'enemy', from: 'E', to: 'N', mode: 'pull' },
      ]),
    ];
    for (let i = 0; i < 60; i++) events.push(...step(world));
    expect(events.some((e) => e.type === 'clash')).toBe(false);
  });

  it('one big army can beat two smaller ones in a row', () => {
    const world = duel(40, 8); // player sends 20
    step(world, [{ type: 'send', side: 'player', from: 'P', to: 'E', mode: 'pull' }]);
    step(world, [{ type: 'send', side: 'enemy', from: 'E', to: 'P', mode: 'pull' }]); // 4
    for (let i = 0; i < 5; i++) step(world);
    step(world, [{ type: 'send', side: 'enemy', from: 'E', to: 'P', mode: 'pull' }]); // 2
    let clashes = 0;
    for (let i = 0; i < 100 && clashes < 2; i++) clashes += step(world).filter((e) => e.type === 'clash').length;
    expect(clashes).toBe(2);
    expect(world.armies.filter((a) => a.owner === 'enemy')).toHaveLength(0);
    expect(world.armies[0]).toMatchObject({ owner: 'player', count: 14 });
  });
});
