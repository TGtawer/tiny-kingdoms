import { describe, expect, it } from 'vitest';
import { ARMY, STREAM, TICK_MS } from '../../../src/config/balance';
import { step } from '../../../src/core/sim/tick';
import { createWorld, type World } from '../../../src/core/sim/World';
import { drain, eventsOf, freezeEconomy, level, node, placeUnit, unitsOf } from '../helpers';

/** P(player) — E(enemy), one road of length 0.8; E also keeps a far node so a capture does not end the battle. */
function duel(playerTroops: number, enemyTroops: number): World {
  return freezeEconomy(
    createWorld(
      level(
        [
          node('P', 0.1, 0.5, { owner: 'player', size: 'large', troops: playerTroops }),
          node('E', 0.9, 0.5, { owner: 'enemy', size: 'large', troops: enemyTroops }),
          node('P2', 0.1, 0.9, { owner: 'player', troops: 1 }),
          node('E2', 0.9, 0.9, { owner: 'enemy', troops: 1 }),
        ],
        [['P', 'E']],
      ),
    ),
  );
}

const sendBoth = [
  { type: 'send', side: 'player', from: 'P', to: 'E' },
  { type: 'send', side: 'enemy', from: 'E', to: 'P' },
] as const;

describe('road clashes 1:1 (GDD 3.6)', () => {
  it('equal columns destroy each other unit by unit; nobody reaches a node', () => {
    const world = duel(20, 20); // 15 vs 15
    const events = [...step(world, [...sendBoth]), ...drain(world)];
    expect(eventsOf(events, 'clash')).toHaveLength(15);
    expect(eventsOf(events, 'arrived')).toHaveLength(0);
    expect(world.nodes.P!.troops).toBe(5);
    expect(world.nodes.E!.troops).toBe(5);
  });

  it('the columns "stand": every pair meets at the same point', () => {
    const world = duel(20, 20);
    const events = [...step(world, [...sendBoth]), ...drain(world)];
    const xs = eventsOf(events, 'clash').map((c) => c.x);
    for (const x of xs) expect(x).toBeCloseTo(0.5, 2);
  });

  it('different lengths: the rest of the longer column marches on and attacks', () => {
    const world = duel(20, 12); // 15 vs 9
    const events = [...step(world, [...sendBoth]), ...drain(world)];
    expect(eventsOf(events, 'clash')).toHaveLength(9);
    const arrived = eventsOf(events, 'arrived');
    expect(arrived).toHaveLength(6);
    expect(arrived.every((a) => a.owner === 'player' && a.nodeId === 'E')).toBe(true);
    // E kept 3 at home: 3 trades, the 4th captures, 2 reinforce.
    expect(world.nodes.E).toMatchObject({ owner: 'player', troops: 3 });
  });

  it('a clash reports both sides and the meeting point', () => {
    const world = duel(20, 20);
    placeUnit(world, 'player', ['P', 'E'], 0.5);
    placeUnit(world, 'enemy', ['E', 'P'], 0.5);
    expect(eventsOf(step(world), 'clash')).toMatchObject([{ owners: ['player', 'enemy'], y: 0.5 }]);
    expect(world.units).toHaveLength(0);
    expect(world.incoming.E!.player + world.incoming.P!.enemy).toBe(0);
  });

  it('same-side units pass through each other', () => {
    const world = duel(20, 20);
    world.nodes.E!.owner = 'player';
    step(world, [
      { type: 'send', side: 'player', from: 'P', to: 'E' },
      { type: 'send', side: 'player', from: 'E', to: 'P' },
    ]);
    const events = drain(world);
    expect(eventsOf(events, 'clash')).toHaveLength(0);
    expect(eventsOf(events, 'arrived')).toHaveLength(30);
  });

  it('a large step does not skip the touch: units closer than 2 × step + contact meet this tick', () => {
    const world = duel(20, 20);
    const step1 = ARMY.speed * (TICK_MS / 1000);
    const gap = 2 * step1 + STREAM.contactDist - 0.001;
    // Positions along the 0.8 road: they would cross each other within this tick.
    placeUnit(world, 'player', ['P', 'E'], 0.4 / 0.8);
    placeUnit(world, 'enemy', ['E', 'P'], (0.4 - gap) / 0.8);
    expect(eventsOf(step(world), 'clash')).toHaveLength(1);
  });

  it('units just out of reach do not touch yet', () => {
    const world = duel(20, 20);
    const step1 = ARMY.speed * (TICK_MS / 1000);
    const gap = 2 * step1 + STREAM.contactDist + 0.001;
    placeUnit(world, 'player', ['P', 'E'], 0.4 / 0.8);
    placeUnit(world, 'enemy', ['E', 'P'], (0.4 - gap) / 0.8);
    expect(eventsOf(step(world), 'clash')).toHaveLength(0);
    expect(eventsOf(step(world), 'clash')).toHaveLength(1);
  });

  it('works between any sides: the second enemy and bandits clash too', () => {
    const world = duel(20, 20);
    placeUnit(world, 'enemy2', ['P', 'E'], 0.5);
    placeUnit(world, 'enemy', ['E', 'P'], 0.5);
    placeUnit(world, 'neutral', ['P', 'E'], 0.3);
    placeUnit(world, 'player', ['E', 'P'], 0.7);
    const clashes = eventsOf(step(world), 'clash');
    expect(clashes.map((c) => c.owners)).toEqual(
      expect.arrayContaining([
        ['enemy2', 'enemy'],
        ['neutral', 'player'],
      ]),
    );
  });
});

describe('clash at the fork by a node', () => {
  /** P — N — E in a line; N is the player's. */
  function fork(): World {
    return freezeEconomy(
      createWorld(
        level(
          [
            node('P', 0.1, 0.5, { owner: 'player', troops: 20 }),
            node('N', 0.5, 0.5, { owner: 'player', troops: 3 }),
            node('E', 0.9, 0.5, { owner: 'enemy', troops: 20 }),
            node('E2', 0.9, 0.9, { owner: 'enemy', troops: 1 }),
          ],
          [
            ['P', 'N'],
            ['N', 'E'],
          ],
        ),
      ),
    );
  }

  it('at the fork the meeting resolves in the node: the passing unit joins the garrison, the attacker trades with it', () => {
    const world = fork();
    // Player unit at the edge of N on its way to E; enemy unit at the edge of N coming from E.
    placeUnit(world, 'player', ['P', 'N', 'E'], 0.99);
    placeUnit(world, 'enemy', ['E', 'N'], 0.99);
    const events = step(world);
    expect(eventsOf(events, 'clash')).toHaveLength(0);
    expect(eventsOf(events, 'transit')).toHaveLength(1);
    expect(eventsOf(events, 'arrived')).toMatchObject([{ owner: 'enemy', nodeId: 'N', outcome: 'repelled' }]);
    // 3 + 1 in transit − 1 traded; the attacked node keeps the transit unit.
    expect(world.nodes.N!.troops).toBe(3);
    expect(world.streams).toHaveLength(0);
  });

  it('a long column through a node against a column coming at it: all pairs clash, none swap', () => {
    const world = fork();
    step(world, [{ type: 'send', side: 'player', from: 'P', to: 'E' }]);
    // Time the enemy so the columns meet right at N.
    for (let i = 0; i < 6; i++) step(world);
    const events = [...step(world, [{ type: 'send', side: 'enemy', from: 'E', to: 'N' }]), ...drain(world)];
    const clashes = eventsOf(events, 'clash').length;
    const enemyAtN = eventsOf(events, 'arrived').filter((a) => a.owner === 'enemy').length;
    // 15 player units vs 15 enemy units: every enemy unit is met on the road or fights at N; none slips past.
    expect(clashes + enemyAtN).toBe(15);
    expect(unitsOf(world, 'enemy')).toHaveLength(0);
  });
});
