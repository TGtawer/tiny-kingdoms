import { describe, expect, it } from 'vitest';
import { ARMY } from '../../../src/config/balance';
import { sendAmount, validate, type SendArmy } from '../../../src/core/sim/commands';
import { step } from '../../../src/core/sim/tick';
import { createWorld } from '../../../src/core/sim/World';
import { freezeEconomy, level, lineWorld, node, run } from '../helpers';

const send = (from: string, to: string, side: 'player' | 'enemy' = 'player'): SendArmy => ({
  type: 'send',
  side,
  from,
  to,
});

describe('sendAmount', () => {
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
    expect(sendAmount(troops)).toBe(expected);
  });
});

describe('send army', () => {
  it('sends half of the node troops and leaves the rest', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 11 } }));
    const events = step(world, [send('P', 'N')]);
    expect(events[0]).toMatchObject({ type: 'applied', armyId: 'a1' });
    expect(world.nodes.P!.troops).toBe(6);
    expect(world.armies[0]).toMatchObject({ owner: 'player', count: 5, path: ['P', 'N'], targetId: 'N' });
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
    expect(world.armies).toHaveLength(0);
  });

  it('routes through intermediate nodes and arrives after distance / speed', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 40 }, N: { owner: 'player', troops: 0 }, E: { troops: 1 } }));
    // P -> E: path P, N, E with length 0.8. Make E reachable but keep it enemy-owned.
    const ticksNeeded = Math.ceil(0.8 / ARMY.speed / 0.1);
    step(world, [send('P', 'E')]);
    expect(world.armies[0]!.path).toEqual(['P', 'N', 'E']);
    run(world, ticksNeeded - 2);
    expect(world.armies).toHaveLength(1);
    // Passing through own node N does not reinforce it.
    expect(world.nodes.N!.troops).toBe(0);
    run(world, 1);
    expect(world.armies).toHaveLength(0);
    expect(world.nodes.E!.owner).toBe('player');
    expect(world.nodes.E!.troops).toBe(19);
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

  it('if a stop on the way is captured, the army attacks it instead', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 40 }, N: { owner: 'player', troops: 0 }, E: { troops: 1 } }));
    run(world, 10, [send('P', 'E')]); // army of 20 is on the P–N road
    world.nodes.N!.owner = 'enemy';
    world.nodes.N!.troops = 5;
    run(world, 30);
    expect(world.armies).toHaveLength(0);
    expect(world.nodes.N).toMatchObject({ owner: 'player', troops: 15 });
    expect(world.nodes.E).toMatchObject({ owner: 'enemy', troops: 1 });
  });

  it('several nodes can send in one tick (multi-select)', () => {
    const world = freezeEconomy(lineWorld({ N: { owner: 'player', troops: 8 } }));
    step(world, [send('P', 'E'), send('N', 'E')]);
    expect(world.armies.map((a) => a.count)).toEqual([5, 4]);
  });

  it('own target: army joins the garrison, even above capacity', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 40 }, N: { owner: 'player', troops: 19 } }));
    run(world, 40, [send('P', 'N')]);
    expect(world.nodes.N!.troops).toBe(39);
  });
});
