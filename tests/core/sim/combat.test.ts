import { describe, expect, it } from 'vitest';
import { BUILDINGS, STREAM, TICK_MS } from '../../../src/config/balance';
import { arriveUnit, defenseHits } from '../../../src/core/sim/combat';
import { step } from '../../../src/core/sim/tick';
import type { Owner, World } from '../../../src/core/sim/World';
import { drain, eventsOf, freezeEconomy, lineWorld } from '../helpers';

/** One unit of `owner` arriving at node `id` right now. */
function arrive(world: World, id: string, owner: Owner = 'player') {
  return arriveUnit(world, 0, owner, world.nodes[id]!);
}

/** `n` units of `owner` arriving at node `id` now. Returns the outcomes. */
function arriveMany(world: World, id: string, n: number, owner: Owner = 'player'): string[] {
  return Array.from({ length: n }, () => arrive(world, id, owner).outcome);
}

describe('a unit arriving at a node (GDD 3.6)', () => {
  it('own node: joins the garrison, even above capacity', () => {
    const world = lineWorld({ P: { troops: 20 } });
    expect(arrive(world, 'P').outcome).toBe('reinforced');
    expect(world.nodes.P!.troops).toBe(21);
    expect(world.nodes.P!.attackedUntilMs).toBe(0);
  });

  it('trades 1:1 with a defender and marks the node attacked', () => {
    const world = lineWorld({ E: { troops: 5 } });
    expect(arrive(world, 'E').outcome).toBe('repelled');
    expect(world.nodes.E).toMatchObject({ owner: 'enemy', troops: 4, attackedUntilMs: STREAM.attackWindowMs });
  });

  it('captures when less than one defender is left; the unit is the new garrison', () => {
    const world = freezeEconomy(lineWorld({ N: { troops: 2 } }));
    expect(arriveMany(world, 'N', 3)).toEqual(['repelled', 'repelled', 'captured']);
    expect(world.nodes.N).toMatchObject({ owner: 'player', troops: 1, attackedUntilMs: 0 });
    expect(arrive(world, 'N').outcome).toBe('reinforced');
  });

  it('a fraction of a defender does not stop an attacker', () => {
    const world = lineWorld({ E: { troops: 0.7 } });
    expect(arrive(world, 'E').outcome).toBe('captured');
  });

  it('uses the owner at arrival time: a target captured meanwhile is reinforced', () => {
    const world = lineWorld({ N: { owner: 'player', troops: 2 } });
    expect(arrive(world, 'N').outcome).toBe('reinforced');
  });

  it('defenseHits: how many attackers the garrison stops before a capture', () => {
    const world = lineWorld({ E: { troops: 5.7 }, N: { troops: 3, kind: 'fortress' } });
    expect(defenseHits(world.nodes.E!)).toBe(5);
    expect(defenseHits(world.nodes.N!)).toBe(6);
  });
});

describe('tower (GDD 3.6, BALANCE.md)', () => {
  it('the first arriving unit always dies (a shot is held in reserve), the next one fights', () => {
    const world = lineWorld({ E: { troops: 5, building: { type: 'tower', level: 1 } } });
    expect(arriveMany(world, 'E', 2)).toEqual(['destroyedByTower', 'repelled']);
    expect(world.nodes.E!.troops).toBe(4);
  });

  it.each([1, 2, 3] as const)('level %i kills about shotsPerSec units per second of a steady stream', (lvl) => {
    const rate = BUILDINGS.tower.shotsPerSec[lvl - 1]!;
    const world = freezeEconomy(lineWorld({ E: { troops: 1000, building: { type: 'tower', level: lvl } } }));
    // Units arrive 5 per second for 4 seconds, as a stream would.
    let killed = 0;
    for (let t = 0; t < 40; t++) {
      world.tick = t;
      if (t % 2 === 0) killed += arrive(world, 'E').outcome === 'destroyedByTower' ? 1 : 0;
    }
    expect(killed).toBeGreaterThanOrEqual(Math.min(20, rate * 4));
    expect(killed).toBeLessThanOrEqual(Math.min(20, rate * 4 + 1));
  });

  it('reloads for 1 / rate seconds after a shot', () => {
    const world = lineWorld({ E: { troops: 50, building: { type: 'tower', level: 1 } } });
    expect(arrive(world, 'E').outcome).toBe('destroyedByTower');
    world.tick = 1000 / TICK_MS - 1;
    expect(arrive(world, 'E').outcome).toBe('repelled');
    world.tick = 1000 / TICK_MS;
    expect(arrive(world, 'E').outcome).toBe('destroyedByTower');
  });

  it('does not shoot the owner’s own units', () => {
    const world = lineWorld({ P: { troops: 5, building: { type: 'tower', level: 3 } } });
    expect(arrive(world, 'P').outcome).toBe('reinforced');
  });

  it('neutral towers defend too', () => {
    const world = lineWorld({ N: { troops: 0, building: { type: 'tower', level: 1 } } });
    expect(arriveMany(world, 'N', 2)).toEqual(['destroyedByTower', 'captured']);
  });

  it('a stream into a tower loses the shot units', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 20 }, N: { troops: 3, building: { type: 'tower', level: 3 } } }));
    const events = [...step(world, [{ type: 'send', side: 'player', from: 'P', to: 'N' }]), ...drain(world)];
    const outcomes = eventsOf(events, 'arrived').map((a) => a.outcome);
    // Units come at 5/s against 3 shots/s: until the capture (~1.6 s) the tower takes the reserve shot + 3 per second.
    const killed = outcomes.filter((o) => o === 'destroyedByTower').length;
    expect(killed).toBeGreaterThanOrEqual(4);
    expect(killed).toBeLessThanOrEqual(6);
    expect(outcomes.filter((o) => o === 'repelled')).toHaveLength(3);
    expect(outcomes.indexOf('captured')).toBe(killed + 3);
    expect(world.nodes.N!.owner).toBe('player');
  });
});

describe('capture and buildings', () => {
  it('a building of any type and level passes to the new owner intact (PLAYTEST-1 F-3)', () => {
    for (const type of ['barracks', 'mine'] as const) {
      for (const level of [1, 2, 3] as const) {
        const world = lineWorld({ E: { troops: 0, building: { type, level } } });
        arrive(world, 'E');
        expect(world.nodes.E).toMatchObject({ owner: 'player', building: { type, level } });
      }
    }
  });

  it('a captured tower keeps its level and its reload, and shoots at its former owner', () => {
    const world = lineWorld({ E: { troops: 0, building: { type: 'tower', level: 2 } } });
    expect(arrive(world, 'E').outcome).toBe('destroyedByTower');
    const node = world.nodes.E!;
    const readyAt = node.towerReadyAtMs;
    expect(arrive(world, 'E').outcome).toBe('captured');
    expect(node.building).toEqual({ type: 'tower', level: 2 });
    expect(node.towerReadyAtMs).toBe(readyAt);
    // The enemy comes back: the tower now kills enemy units.
    world.nodes.E!.troops = 5;
    world.tick += 100;
    expect(arriveMany(world, 'E', 1, 'enemy')).toEqual(['destroyedByTower']);
  });
});
