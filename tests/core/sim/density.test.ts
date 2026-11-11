import { describe, expect, it } from 'vitest';
import { STREAM, TICK_MS } from '../../../src/config/balance';
import type { Command } from '../../../src/core/sim/commands';
import { COLUMN_STEP } from '../../../src/core/sim/stream';
import { step, type TickEvent } from '../../../src/core/sim/tick';
import { createWorld, isAttacked, type World } from '../../../src/core/sim/World';
import { eventsOf, freezeEconomy, level, node } from '../helpers';

/** Smallest distance between neighbours on any lane, field units (Infinity with fewer than two units on every lane). */
function minGap(world: World): number {
  let min = Infinity;
  for (const lane of world.lanes) {
    for (let i = 1; i < lane.units.length; i++) {
      min = Math.min(min, (lane.units[i - 1]!.progress - lane.units[i]!.progress) * lane.length);
    }
  }
  return min;
}

/** Runs `ticks` steps with `commands(tick)` and checks the column step after every tick; returns all events. */
function runChecked(world: World, ticks: number, commands: (t: number) => Command[] = () => []): TickEvent[] {
  const events: TickEvent[] = [];
  for (let t = 0; t < ticks && !world.winner; t++) {
    events.push(...step(world, commands(t)));
    expect(minGap(world), `tick ${t}`).toBeGreaterThanOrEqual(COLUMN_STEP - 1e-9);
  }
  return events;
}

const send = (from: string, to: string, side: 'player' | 'enemy' = 'player'): Command => ({ type: 'send', side, from, to });

/**
 * P — N — E in a line, Q — N from the side (the player's P, Q, N), E2 keeps the enemy alive.
 * Lanes N -> E are shared by everything the player sends to E.
 */
function cross(): World {
  return freezeEconomy(
    createWorld(
      level(
        [
          node('P', 0.1, 0.5, { owner: 'player', size: 'large', troops: 40 }),
          node('Q', 0.5, 0.1, { owner: 'player', size: 'large', troops: 40 }),
          node('N', 0.5, 0.5, { owner: 'player', size: 'large', troops: 30 }),
          node('E', 0.9, 0.5, { owner: 'enemy', size: 'large', troops: 200 }),
          node('E2', 0.9, 0.95, { owner: 'enemy', troops: 1 }),
        ],
        [
          ['P', 'N'],
          ['Q', 'N'],
          ['N', 'E'],
        ],
      ),
    ),
  );
}

describe('lane density (GDD 3.6): a column is never denser than one stream', () => {
  it('the column step is at least one tick of walking: at most one unit enters a road per tick', () => {
    expect(COLUMN_STEP).toBeGreaterThanOrEqual((0.12 * TICK_MS) / 1000);
    expect(STREAM.width).toBe(1);
  });

  it('frequent re-swipes from one node', () => {
    const world = cross();
    const events = runChecked(world, 120, (t) => (t % 3 === 0 && t < 60 ? [send('P', 'E')] : []));
    expect(eventsOf(events, 'arrived').length).toBeGreaterThan(0);
  });

  it('transit and the node’s own order on the same road take turns', () => {
    const world = cross();
    // P's column passes N; N sends its own order to E while the transit goes on.
    const events = runChecked(world, 200, (t) => (t === 0 ? [send('P', 'E')] : t === 25 ? [send('N', 'E')] : []));
    const transit = eventsOf(events, 'transit').length;
    expect(transit).toBe(39);
    // Everything that left P and N reached E (39 from P, 29 from N): nothing was lost to the queue.
    expect(eventsOf(events, 'arrived').filter((a) => a.nodeId === 'E')).toHaveLength(39 + 29);
  });

  it('a multi-node swipe whose columns merge on one road', () => {
    const world = cross();
    const events = runChecked(world, 250, (t) => (t === 0 ? [send('P', 'E'), send('Q', 'E'), send('N', 'E')] : []));
    expect(eventsOf(events, 'arrived').filter((a) => a.nodeId === 'E')).toHaveLength(39 + 39 + 29);
  });

  it('a citadel wave and the citadel’s own order on the same road', () => {
    const world = freezeEconomy(
      createWorld(
        level(
          [
            node('C', 0.9, 0.5, { owner: 'enemy', size: 'large', troops: 40, kind: 'fortress', capital: true }),
            node('P', 0.1, 0.5, { owner: 'player', size: 'large', troops: 300 }),
            node('P2', 0.1, 0.95, { owner: 'player', troops: 1 }),
          ],
          [['C', 'P']],
          { special: { type: 'citadel', params: { nodeId: 'C' } } },
        ),
      ),
    );
    const waveTick = 15000 / TICK_MS;
    const events = runChecked(world, waveTick + 100, (t) => (t === waveTick - 2 ? [send('C', 'P', 'enemy')] : []));
    expect(eventsOf(events, 'citadelWave')).toHaveLength(1);
  });
});

describe('transit through own nodes (GDD 3.6)', () => {
  it('units enter the garrison of a stop and leave it again with the rest of the route', () => {
    const world = cross();
    const events = [...step(world, [send('P', 'E')])];
    for (let t = 0; t < 200; t++) events.push(...step(world));
    expect(eventsOf(events, 'transit').filter((e) => e.nodeId === 'N')).toHaveLength(39);
    expect(eventsOf(events, 'arrived').filter((a) => a.nodeId === 'E')).toHaveLength(39);
    expect(world.nodes.N!.troops).toBe(30);
  });

  it('a re-swipe from the stop cancels the forwarding too: the transit stays in its garrison', () => {
    const world = cross();
    // N's own column holds the road to E, so P's units queue in N as transit.
    step(world, [send('N', 'E'), send('P', 'E')]);
    let queued = null;
    for (let t = 0; t < 100 && !queued; t++) {
      step(world);
      queued = world.streams.find((s) => s.sourceId === 'N' && s.transit && s.left > 0) ?? null;
    }
    expect(queued).not.toBeNull();
    const troops = world.nodes.N!.troops;
    step(world, [send('N', 'Q')]);
    const fromN = world.streams.filter((s) => s.sourceId === 'N');
    expect(fromN.map((s) => s.route.path)).toEqual([['N', 'Q']]);
    // The garrison with the transit in it, all but one; that one stays home.
    expect(fromN[0]!.left + 1).toBe(troops - 1);
  });

  it('an attacked stop keeps the transit; nothing goes on by itself afterwards', () => {
    const world = cross();
    step(world, [send('P', 'E')]);
    for (let t = 0; t < 40; t++) step(world);
    world.nodes.N!.attackedUntilMs = world.tick * TICK_MS + 5000;
    for (let t = 0; t < 10; t++) step(world);
    expect(world.streams.filter((s) => s.sourceId === 'N')).toHaveLength(0);
  });
});

describe('any damage to the garrison is an attack (GDD 3.6, 3.8)', () => {
  it('a fireball stops the target node’s streams and its production', () => {
    const world = createWorld(
      level(
        [
          node('P', 0.1, 0.5, { owner: 'player', size: 'large', troops: 20 }),
          node('E', 0.9, 0.5, { owner: 'enemy', size: 'large', troops: 20 }),
        ],
        [['P', 'E']],
        { playerStartGold: 100 },
      ),
      { player: { unlockedSpells: ['fireball'] } },
    );
    step(world, [send('E', 'P', 'enemy')]);
    expect(world.streams).toHaveLength(1);
    step(world, [{ type: 'cast', side: 'player', spell: 'fireball', nodeId: 'E' }]);
    expect(isAttacked(world, world.nodes.E!)).toBe(true);
    expect(world.streams).toHaveLength(0);
  });
});

describe('units appear and arrive at the edge of the circles', () => {
  it('a new unit starts at STREAM.edgeDist from the source center; it arrives at edgeDist from the target', () => {
    const world = cross();
    step(world, [send('P', 'N')]);
    const lane = world.lanes[world.units[0]!.route.lanes[0]!]!;
    expect(world.units[0]!.progress * lane.length).toBeCloseTo(STREAM.edgeDist.large, 9);
    expect((1 - lane.endP) * lane.length).toBeCloseTo(STREAM.edgeDist.large, 9);
  });

  it('the node number changes at the moment the unit touches the edge', () => {
    const world = cross();
    const before = world.nodes.N!.troops;
    step(world, [{ type: 'send', side: 'player', from: 'P', to: 'N' }]);
    const lane = world.lanes[world.units[0]!.route.lanes[0]!]!;
    const ticks = Math.ceil(((lane.endP - lane.startP) * lane.length) / ((0.12 * TICK_MS) / 1000) - 1e-9);
    for (let t = 0; t < ticks - 1; t++) step(world);
    expect(world.nodes.N!.troops).toBe(before);
    step(world);
    expect(world.nodes.N!.troops).toBe(before + 1);
  });
});
