import { describe, expect, it } from 'vitest';
import { BUILDINGS, NODES } from '../../../src/config/balance';
import { goldRate, nodeCapacity, sideGoldRate, troopRate } from '../../../src/core/sim/economy';
import { step } from '../../../src/core/sim/tick';
import { lineWorld, run } from '../helpers';

describe('troop production', () => {
  it.each(['small', 'medium', 'large'] as const)('%s node produces its base rate per second', (size) => {
    const world = lineWorld({ P: { size, troops: 0 } });
    run(world, 10); // 1 second
    expect(world.nodes.P!.troops).toBeCloseTo(NODES[size].troopsPerSec, 6);
  });

  it('stops at capacity', () => {
    const world = lineWorld({ P: { troops: NODES.small.capacity - 0.1 } });
    run(world, 50);
    expect(world.nodes.P!.troops).toBe(NODES.small.capacity);
  });

  it('does not reduce a node filled above capacity', () => {
    const world = lineWorld({ P: { troops: 100 } });
    run(world, 10);
    expect(world.nodes.P!.troops).toBe(100);
  });

  it('neutral nodes do not produce troops or gold', () => {
    const world = lineWorld({ N: { troops: 5, hasGoldVein: true, building: { type: 'mine', level: 3 } } });
    run(world, 50);
    expect(world.nodes.N!.troops).toBe(5);
    expect(troopRate(world.nodes.N!, world.sides.player.modifiers)).toBe(0);
    expect(goldRate(world.nodes.N!, world.sides.player.modifiers)).toBe(0);
  });

  it.each([1, 2, 3] as const)('barracks level %i multiplies production and adds capacity', (lvl) => {
    const world = lineWorld({ P: { troops: 0, building: { type: 'barracks', level: lvl } } });
    const p = world.nodes.P!;
    expect(nodeCapacity(p)).toBe(NODES.small.capacity + BUILDINGS.barracks.extraCapacity[lvl - 1]!);
    expect(troopRate(p, world.sides.player.modifiers)).toBeCloseTo(
      NODES.small.troopsPerSec * BUILDINGS.barracks.productionMult[lvl - 1]!,
    );
  });

  it('applies the side production multiplier (enemy productionMult from level)', () => {
    const world = lineWorld({ E: { troops: 0 } }, { enemy: { productionMult: 0.7, aiThinkMs: 1000, aggression: 0.5, startGold: 0 } });
    run(world, 10);
    expect(world.nodes.E!.troops).toBeCloseTo(NODES.small.troopsPerSec * 0.7, 6);
  });
});

describe('gold', () => {
  it('every owned node gives base gold', () => {
    const world = lineWorld({ P: { size: 'large' } });
    run(world, 10);
    expect(world.sides.player.gold).toBeCloseTo(NODES.large.goldPerSec, 6);
    expect(world.sides.enemy.gold).toBeCloseTo(NODES.small.goldPerSec, 6);
  });

  it.each([1, 2, 3] as const)('mine level %i on a gold vein adds extra gold', (lvl) => {
    const world = lineWorld({ P: { hasGoldVein: true, building: { type: 'mine', level: lvl } } });
    run(world, 10);
    expect(world.sides.player.gold).toBeCloseTo(NODES.small.goldPerSec + BUILDINGS.mine.extraGoldPerSec[lvl - 1]!, 6);
  });

  it('applies the gold income multiplier', () => {
    const world = lineWorld();
    world.sides.player.modifiers.goldIncomeMult = 1.5;
    step(world);
    expect(world.sides.player.gold).toBeCloseTo(NODES.small.goldPerSec * 0.1 * 1.5, 9);
  });
});

describe('sideGoldRate', () => {
  it('sums the gold rate of the side nodes, mines and income bonus included', () => {
    const world = lineWorld({
      P: { size: 'large', hasGoldVein: true, building: { type: 'mine', level: 1 } },
      N: { owner: 'player', size: 'small' },
    });
    world.sides.player.modifiers.goldIncomeMult = 2;
    const expected = (NODES.large.goldPerSec + BUILDINGS.mine.extraGoldPerSec[0] + NODES.small.goldPerSec) * 2;
    expect(sideGoldRate(world, 'player')).toBeCloseTo(expected, 9);
    expect(sideGoldRate(world, 'enemy')).toBeCloseTo(NODES.small.goldPerSec, 9);
  });

  it('matches the gold actually produced', () => {
    const world = lineWorld({ N: { owner: 'player' } });
    const rate = sideGoldRate(world, 'player');
    const before = world.sides.player.gold;
    run(world, 10);
    expect(world.sides.player.gold - before).toBeCloseTo(rate, 6);
  });
});
