import { describe, expect, it } from 'vitest';
import { ARMY } from '../../../src/config/balance';
import { sendAmount, validate, type SendArmy } from '../../../src/core/sim/commands';
import { step } from '../../../src/core/sim/tick';
import { createWorld } from '../../../src/core/sim/World';
import { drain, eventsOf, freezeEconomy, level, lineWorld, node, run } from '../helpers';

/** Most mechanics tests use the AI's `pull` mode (50%) so the numbers stay small and easy to follow. */
const send = (from: string, to: string, side: 'player' | 'enemy' = 'player'): SendArmy => ({
  type: 'send',
  side,
  from,
  to,
  mode: 'pull',
});

describe('sendAmount for an AI pull (50%)', () => {
  it.each([
    [0, 0],
    [1, 0],
    [1.99, 0],
    [2, 1],
    [3, 1],
    [10, 5],
    [11, 5],
    [11.7, 5],
  ])('%f troops -> sends %i', (troops, expected) => {
    expect(sendAmount(troops, 'pull')).toBe(expected);
  });
});

describe('sendAmount for a swipe (75%)', () => {
  it.each([
    [1, 0],
    [2, 1],
    [3, 2],
    [4, 3],
    [10, 7],
    [11, 8],
    [20, 15],
  ])('%f troops -> sends %i, at least one stays', (troops, expected) => {
    expect(sendAmount(troops, 'swipe')).toBe(expected);
    if (troops >= 2) expect(troops - sendAmount(troops, 'swipe')).toBeGreaterThanOrEqual(1);
  });

  it('a swipe is the default; only the AI pull sends half', () => {
    expect(sendAmount(20)).toBe(15);
    expect(sendAmount(20, 'pull')).toBe(10);
  });
});

describe('send (a stream order)', () => {
  it('a swipe order takes 75% of the troops', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 20 } }));
    const events = step(world, [{ ...send('P', 'N'), mode: 'swipe' }]);
    expect(events[0]).toMatchObject({ type: 'applied', streamId: 1 });
    drain(world);
    expect(world.nodes.P!.troops).toBe(5);
    expect(world.nodes.N).toMatchObject({ owner: 'player', troops: 15 - 5 });
  });

  it('an AI pull sends half of the node troops and leaves the rest', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 11 } }));
    step(world, [send('P', 'N')]);
    expect(world.streams[0]).toMatchObject({ owner: 'player', path: ['P', 'N'], left: 4 });
    drain(world);
    expect(world.nodes.P!.troops).toBe(6);
  });

  it('cannot send from a node with 1 troop', () => {
    const world = lineWorld({ P: { troops: 1 } });
    expect(validate(world, send('P', 'N'))).toBe('notEnoughTroops');
  });

  it('rejects sends from foreign nodes, to itself, to unknown nodes', () => {
    const world = lineWorld();
    expect(validate(world, send('E', 'N'))).toBe('notOwner');
    expect(validate(world, send('P', 'P'))).toBe('sameNode');
    expect(validate(world, send('P', 'X'))).toBe('unknownNode');
  });

  it('rejects unreachable targets', () => {
    const world = createWorld(
      level([node('P', 0, 0, { owner: 'player', troops: 10 }), node('E', 1, 1, { owner: 'enemy', troops: 10 })], []),
    );
    expect(validate(world, send('P', 'E'))).toBe('noPath');
  });

  it('a rejected command does not change the world', () => {
    const world = lineWorld({ P: { troops: 1 } });
    const events = step(world, [send('P', 'N')]);
    expect(events[0]).toMatchObject({ type: 'rejected', reason: 'notEnoughTroops' });
    expect(world.streams).toHaveLength(0);
    expect(world.units).toHaveLength(0);
  });

  it('routes through own nodes; the first unit arrives after distance / speed', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 40 }, N: { owner: 'player', troops: 0 }, E: { troops: 1 } }));
    // P -> E: path P, N, E with length 0.8; the first unit leaves on the order's tick.
    const ticksNeeded = Math.ceil(0.8 / ARMY.speed / 0.1);
    step(world, [send('P', 'E')]);
    expect(world.streams[0]!.path).toEqual(['P', 'N', 'E']);
    const arrivals = [];
    for (let i = 1; i < ticksNeeded - 1; i++) arrivals.push(...eventsOf(step(world), 'arrived'));
    expect(arrivals).toHaveLength(0);
    // Passing through own node N does not reinforce it.
    expect(world.nodes.N!.troops).toBe(0);
    arrivals.push(...eventsOf(step(world), 'arrived'));
    expect(arrivals).toMatchObject([{ nodeId: 'E', outcome: 'repelled' }]);
    drain(world);
    // The second unit captures E, the enemy's last node: the battle is over.
    expect(world.nodes.E!.owner).toBe('player');
    expect(world.winner).toBe('player');
  });

  it('cannot pass through neutral or enemy nodes', () => {
    const world = lineWorld({ P: { troops: 40 } });
    // N is neutral and stands between P and E.
    expect(validate(world, send('P', 'E'))).toBe('noPath');
    // An adjacent foreign node is a valid target.
    expect(validate(world, send('P', 'N'))).toBeNull();
    world.nodes.N!.owner = 'enemy';
    expect(validate(world, send('P', 'E'))).toBe('noPath');
  });

  it('if a stop on the way is captured, each unit attacks it instead', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 40 }, N: { owner: 'player', troops: 0 }, E: { troops: 1 } }));
    run(world, 10, [send('P', 'E')]); // the column is on the P–N road
    world.nodes.N!.owner = 'enemy';
    world.nodes.N!.troops = 5;
    const first = eventsOf(drain(world), 'arrived')[0];
    expect(first).toMatchObject({ nodeId: 'N', owner: 'player', outcome: 'repelled' });
    expect(world.nodes.N!.owner).toBe('player');
  });

  it('own target: units join the garrison, even above capacity', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 40 }, N: { owner: 'player', troops: 19 } }));
    step(world, [send('P', 'N')]);
    drain(world);
    expect(world.nodes.N!.troops).toBe(39);
  });
});
