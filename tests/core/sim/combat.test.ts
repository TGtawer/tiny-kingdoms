import { describe, expect, it } from 'vitest';
import { STREAM } from '../../../src/config/balance';
import { arriveUnit, defenseHits } from '../../../src/core/sim/combat';
import type { Owner, World } from '../../../src/core/sim/World';
import { freezeEconomy, lineWorld } from '../helpers';

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
});
