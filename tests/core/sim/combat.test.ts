import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../../../src/config/balance';
import { arrive, resolveBattle } from '../../../src/core/sim/combat';
import { downgradeOnCapture } from '../../../src/core/sim/capture';
import type { ArmyState, World } from '../../../src/core/sim/World';
import { freezeEconomy, lineWorld } from '../helpers';

function army(world: World, count: number, targetId: string, owner: 'player' | 'enemy' = 'player'): ArmyState {
  return { id: `t${world.nextArmyId++}`, owner, count, path: ['P', targetId], segment: 1, progress: 0, targetId };
}

describe('resolveBattle', () => {
  it('destroys troops 1:1', () => {
    expect(resolveBattle(10, 1, 4, 1)).toEqual({ attackersLeft: 6, defendersLeft: 0 });
    expect(resolveBattle(4, 1, 10, 1)).toEqual({ attackersLeft: 0, defendersLeft: 6 });
  });

  it('a tie leaves the defender with zero troops', () => {
    expect(resolveBattle(5, 1, 5, 1)).toEqual({ attackersLeft: 0, defendersLeft: 0 });
  });

  it('unit strength scales combat power', () => {
    // 10 attackers at 1.5 = 15 power vs 12 defenders: 3 power left = 2 attackers.
    expect(resolveBattle(10, 1.5, 12, 1).attackersLeft).toBeCloseTo(2);
    // 10 attackers vs 8 defenders at 1.5 = 12 power: 2 power left = 4/3 defenders.
    expect(resolveBattle(10, 1, 8, 1.5).defendersLeft).toBeCloseTo(4 / 3);
  });
});

describe('arrival at a foreign node', () => {
  it('captures a neutral node when attackers outnumber, remainder becomes the garrison', () => {
    const world = freezeEconomy(lineWorld({ N: { troops: 5 } }));
    const result = arrive(world, army(world, 8, 'N'));
    expect(result.outcome).toBe('captured');
    expect(world.nodes.N).toMatchObject({ owner: 'player', troops: 3 });
  });

  it('is repelled when attackers are not enough', () => {
    const world = lineWorld({ E: { troops: 10 } });
    const result = arrive(world, army(world, 6, 'E'));
    expect(result.outcome).toBe('repelled');
    expect(world.nodes.E).toMatchObject({ owner: 'enemy', troops: 4 });
  });

  it('a tie does not capture', () => {
    const world = lineWorld({ E: { troops: 6 } });
    expect(arrive(world, army(world, 6, 'E')).outcome).toBe('repelled');
    expect(world.nodes.E).toMatchObject({ owner: 'enemy', troops: 0 });
  });

  it('uses the owner at arrival time (target captured meanwhile becomes reinforcement)', () => {
    const world = lineWorld({ N: { owner: 'player', troops: 2 } });
    expect(arrive(world, army(world, 5, 'N')).outcome).toBe('reinforced');
    expect(world.nodes.N!.troops).toBe(7);
  });

  it('applies unit strength of both sides', () => {
    const world = lineWorld({ E: { troops: 12 } });
    world.sides.player.modifiers.unitStrengthMult = 1.5;
    arrive(world, army(world, 10, 'E'));
    expect(world.nodes.E!.owner).toBe('player');
    expect(world.nodes.E!.troops).toBeCloseTo(2);
  });
});

describe('tower', () => {
  it.each([1, 2, 3] as const)('level %i damages the arriving army before combat', (lvl) => {
    const damage = BUILDINGS.tower.damage[lvl - 1]!;
    const world = lineWorld({ E: { troops: 5, building: { type: 'tower', level: lvl } } });
    // Without the tower, 5 + damage attackers would win; with it, it's a tie.
    const result = arrive(world, army(world, 5 + damage, 'E'));
    expect(result.towerDamage).toBe(damage);
    expect(result.outcome).toBe('repelled');
    expect(world.nodes.E).toMatchObject({ owner: 'enemy', troops: 0 });
  });

  it('can destroy a small army entirely', () => {
    const world = lineWorld({ E: { troops: 5, building: { type: 'tower', level: 3 } } });
    const result = arrive(world, army(world, 3, 'E'));
    expect(result).toMatchObject({ outcome: 'destroyedByTower', towerDamage: 3 });
    expect(world.nodes.E!.troops).toBe(5);
  });

  it('does not hit the owner’s own armies', () => {
    const world = lineWorld({ P: { troops: 5, building: { type: 'tower', level: 3 } } });
    const result = arrive(world, army(world, 4, 'P'));
    expect(result).toMatchObject({ outcome: 'reinforced', towerDamage: 0 });
    expect(world.nodes.P!.troops).toBe(9);
  });

  it('neutral towers defend too', () => {
    const world = lineWorld({ N: { troops: 0, building: { type: 'tower', level: 1 } } });
    const result = arrive(world, army(world, 6, 'N'));
    expect(result.outcome).toBe('captured');
    expect(world.nodes.N!.troops).toBe(6 - BUILDINGS.tower.damage[0]!);
  });
});

describe('capture and buildings', () => {
  it('building passes to the new owner and loses a level', () => {
    const world = lineWorld({ E: { troops: 1, building: { type: 'barracks', level: 3 } } });
    arrive(world, army(world, 5, 'E'));
    expect(world.nodes.E).toMatchObject({ owner: 'player', building: { type: 'barracks', level: 2 } });
  });

  it('level 1 building is destroyed on capture', () => {
    const world = lineWorld({ E: { troops: 1, building: { type: 'barracks', level: 1 } } });
    arrive(world, army(world, 5, 'E'));
    expect(world.nodes.E).toMatchObject({ owner: 'player', building: null });
  });

  it('tower is downgraded after it fired', () => {
    const world = lineWorld({ E: { troops: 0, building: { type: 'tower', level: 2 } } });
    arrive(world, army(world, 20, 'E'));
    expect(world.nodes.E).toMatchObject({ owner: 'player', troops: 20 - BUILDINGS.tower.damage[1]! });
    expect(world.nodes.E!.building).toEqual({ type: 'tower', level: 1 });
  });

  it('downgradeOnCapture', () => {
    expect(downgradeOnCapture(null)).toBeNull();
    expect(downgradeOnCapture({ type: 'mine', level: 1 })).toBeNull();
    expect(downgradeOnCapture({ type: 'mine', level: 2 })).toEqual({ type: 'mine', level: 1 });
    expect(downgradeOnCapture({ type: 'mine', level: 3 })).toEqual({ type: 'mine', level: 2 });
  });
});
