import { describe, expect, it } from 'vitest';
import { ARMY, STREAM, TICK_MS } from '../../../src/config/balance';
import { validate } from '../../../src/core/sim/commands';
import { step } from '../../../src/core/sim/tick';
import { unitPosition } from '../../../src/core/sim/units';
import { createWorld, isAttacked } from '../../../src/core/sim/World';
import { drain, eventsOf, freezeEconomy, level, lineWorld, node, placeUnit, run, unitsOf } from '../helpers';

const swipe = (from: string, to: string, side: 'player' | 'enemy' = 'player') => ({ type: 'send', side, from, to }) as const;
const ticksPerSec = 1000 / TICK_MS;

describe('stream release (GDD 3.6)', () => {
  it('units leave one by one at STREAM.releasePerSec, the first at once', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 40 } }));
    step(world, [swipe('P', 'N')]);
    expect(world.units).toHaveLength(1);
    run(world, ticksPerSec - 1);
    // One second: releasePerSec units (the road's entry frees every column step).
    expect(world.units).toHaveLength(STREAM.releasePerSec);
  });

  it('the column has an even step of speed / releasePerSec', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 40 } }));
    run(world, 20, [swipe('P', 'N')]);
    const xs = world.units.map((u) => unitPosition(world, u, { x: 0, y: 0 }).x).sort((a, b) => b - a);
    const gap = ARMY.speed / STREAM.releasePerSec;
    for (let i = 1; i < xs.length; i++) expect(xs[i - 1]! - xs[i]!).toBeCloseTo(gap, 9);
  });

  it('the node count goes down as units leave; the rest still defends the node', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 20 } }));
    step(world, [swipe('P', 'N')]);
    expect(world.nodes.P!.troops).toBe(19);
    expect(world.streams[0]).toMatchObject({ sourceId: 'P', left: 14 });
    run(world, ticksPerSec);
    expect(world.nodes.P!.troops).toBe(20 - world.units.length);
    drain(world);
    expect(world.nodes.P!.troops).toBe(5);
    expect(world.streams).toHaveLength(0);
    expect(world.nodes.P!.streams).toBe(0);
  });

  it('released counts every unit a node put on a road, transit included (docs/FX.md FX-3)', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 20 }, N: { owner: 'player', troops: 2 } }));
    step(world, [swipe('P', 'E')]);
    const sent = world.streams[0]!.left + 1;
    expect(world.nodes.P!.released).toBe(1);
    const events = drain(world);
    expect(world.nodes.P!.released).toBe(sent);
    // Every unit passed N in transit and left it again.
    expect(world.nodes.N!.released).toBe(eventsOf(events, 'transit').filter((e) => e.nodeId === 'N').length);
    expect(world.nodes.N!.released).toBeGreaterThan(0);
    expect(world.nodes.E!.released).toBe(0);
  });

  it('a re-swipe cancels the rest of the old stream and sends 75% of the current garrison', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 20 } }));
    run(world, ticksPerSec, [swipe('P', 'N')]);
    const out = world.units.length;
    expect(world.nodes.P!.troops).toBe(20 - out);
    step(world, [swipe('P', 'N')]);
    expect(world.streams).toHaveLength(1);
    // 75% of 20 - out, one of them already released this tick.
    expect(world.streams[0]!.left).toBe(Math.floor((20 - out) * 0.75) - 1);
  });

  it('a multi-node swipe: every source releases its own stream at the same time', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 10 }, N: { owner: 'player', troops: 8 } }));
    step(world, [swipe('P', 'E'), swipe('N', 'E')]);
    expect(world.streams.map((s) => [s.sourceId, s.left + 1])).toEqual([
      ['P', 7],
      ['N', 6],
    ]);
    expect(world.units).toHaveLength(2);
  });

  it('a stream stops when its source is attacked; the rest stays home and nothing resumes', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 20 }, N: { owner: 'enemy', troops: 0 } }));
    step(world, [swipe('P', 'N')]);
    // An enemy unit about to reach P.
    placeUnit(world, 'enemy', ['N', 'P'], 0.99);
    const events = [...step(world), ...step(world)];
    expect(eventsOf(events, 'arrived').some((e) => e.nodeId === 'P' && e.owner === 'enemy')).toBe(true);
    expect(world.streams).toHaveLength(0);
    const left = world.nodes.P!.troops;
    run(world, 3 * ticksPerSec);
    expect(world.nodes.P!.troops).toBe(left);
    expect(unitsOf(world, 'player').length).toBeLessThanOrEqual(2);
  });

  it('the source captured while releasing: the stream breaks off, units already out march on', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 3 }, N: { owner: 'enemy', troops: 0 } }));
    step(world, [swipe('P', 'N')]);
    expect(world.units).toHaveLength(1);
    // Three enemy units: two trade with P's two defenders, the third captures P.
    for (let i = 0; i < 3; i++) placeUnit(world, 'enemy', ['N', 'P'], 0.99);
    step(world);
    expect(world.nodes.P!.owner).toBe('enemy');
    expect(world.streams).toHaveLength(0);
    expect(unitsOf(world, 'player')).toHaveLength(1);
  });

  it('never releases the last troop, even if the garrison shrank meanwhile', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 20 } }));
    step(world, [swipe('P', 'N')]);
    world.nodes.P!.troops = 3;
    drain(world);
    expect(world.nodes.P!.troops).toBe(1);
  });
});

describe('attacked nodes (GDD 3.6)', () => {
  it('a node counts as attacked from the first hostile arrival until attackWindowMs after the last', () => {
    const world = freezeEconomy(lineWorld({ N: { owner: 'enemy', troops: 0 } }));
    placeUnit(world, 'enemy', ['N', 'P'], 0.99);
    step(world);
    expect(isAttacked(world, world.nodes.P!)).toBe(true);
    run(world, STREAM.attackWindowMs / TICK_MS - 2);
    expect(isAttacked(world, world.nodes.P!)).toBe(true);
    step(world);
    expect(isAttacked(world, world.nodes.P!)).toBe(false);
  });

  it('units killed on the road do not count as an attack', () => {
    const world = freezeEconomy(lineWorld({ N: { owner: 'enemy', troops: 0 } }));
    placeUnit(world, 'enemy', ['N', 'P'], 0.5);
    placeUnit(world, 'player', ['P', 'N'], 0.5);
    run(world, 30);
    expect(world.units).toHaveLength(0);
    expect(world.nodes.P!.attackedUntilMs).toBe(0);
  });

  it('an attacked node cannot start a stream', () => {
    const world = freezeEconomy(lineWorld({ N: { owner: 'enemy', troops: 0 } }));
    placeUnit(world, 'enemy', ['N', 'P'], 0.99);
    step(world);
    expect(validate(world, swipe('P', 'N'))).toBe('underAttack');
  });

  it('the attacked node stops producing; the attacker and the source keep producing', () => {
    const world = createWorld(
      level(
        [node('P', 0.1, 0.5, { owner: 'player', troops: 5 }), node('E', 0.9, 0.5, { owner: 'enemy', size: 'large', troops: 20 })],
        [['P', 'E']],
      ),
    );
    placeUnit(world, 'enemy', ['E', 'P'], 0.99);
    step(world);
    // One trade: 5 - 1 (no production while attacked).
    expect(world.nodes.P!.troops).toBe(4);
    run(world, 5);
    expect(world.nodes.P!.troops).toBe(4);
    expect(world.nodes.E!.troops).toBeGreaterThan(20);

    // A releasing source still produces (STREAM.pauseSourceProduction is off).
    const before = world.nodes.E!.troops;
    step(world, [swipe('E', 'P', 'enemy')]);
    run(world, 5);
    expect(STREAM.pauseSourceProduction).toBe(false);
    const released = world.units.length;
    expect(world.nodes.E!.troops).toBeGreaterThan(before - released);
  });
});
