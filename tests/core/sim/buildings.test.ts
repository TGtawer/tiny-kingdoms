import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../../../src/config/balance';
import { buildCost, validate, type Build, type Upgrade } from '../../../src/core/sim/commands';
import { step } from '../../../src/core/sim/tick';
import { freezeEconomy, lineWorld } from '../helpers';

const build = (nodeId: string, building: Build['building'], side: Build['side'] = 'player'): Build => ({
  type: 'build',
  side,
  nodeId,
  building,
});
const upgrade = (nodeId: string): Upgrade => ({ type: 'upgrade', side: 'player', nodeId });

describe('build', () => {
  it('builds a level 1 building and spends gold', () => {
    const world = freezeEconomy(lineWorld({}, { playerStartGold: 100 }));
    step(world, [build('P', 'barracks')]);
    expect(world.nodes.P!.building).toEqual({ type: 'barracks', level: 1 });
    expect(world.sides.player.gold).toBe(100 - BUILDINGS.cost[0]);
  });

  it('mine only on a gold vein', () => {
    const world = lineWorld({}, { playerStartGold: 100 });
    expect(validate(world, build('P', 'mine'))).toBe('noGoldVein');
    world.nodes.P!.hasGoldVein = true;
    expect(validate(world, build('P', 'mine'))).toBeNull();
  });

  it('barracks and tower can be built on any own node', () => {
    const world = lineWorld({}, { playerStartGold: 100 });
    expect(validate(world, build('P', 'barracks'))).toBeNull();
    expect(validate(world, build('P', 'tower'))).toBeNull();
  });

  it('one building per node', () => {
    const world = lineWorld({ P: { building: { type: 'tower', level: 1 } } }, { playerStartGold: 100 });
    expect(validate(world, build('P', 'barracks'))).toBe('occupied');
  });

  it('cannot build on foreign nodes or without gold', () => {
    const world = lineWorld({}, { playerStartGold: BUILDINGS.cost[0] - 1 });
    expect(validate(world, build('N', 'tower'))).toBe('notOwner');
    expect(validate(world, build('P', 'tower'))).toBe('notEnoughGold');
  });
});

describe('upgrade', () => {
  it('upgrades 1 -> 2 -> 3 with growing costs', () => {
    const world = freezeEconomy(lineWorld({ P: { building: { type: 'tower', level: 1 } } }, { playerStartGold: 1000 }));
    step(world, [upgrade('P')]);
    expect(world.nodes.P!.building!.level).toBe(2);
    step(world, [upgrade('P')]);
    expect(world.nodes.P!.building!.level).toBe(3);
    expect(world.sides.player.gold).toBe(1000 - BUILDINGS.cost[1] - BUILDINGS.cost[2]);
  });

  it('rejects max level, empty slots and lack of gold', () => {
    const world = lineWorld({ P: { building: { type: 'tower', level: 3 } } }, { playerStartGold: 1000 });
    expect(validate(world, upgrade('P'))).toBe('maxLevel');
    world.nodes.P!.building = null;
    expect(validate(world, upgrade('P'))).toBe('noBuilding');
    world.nodes.P!.building = { type: 'tower', level: 2 };
    world.sides.player.gold = BUILDINGS.cost[2] - 1;
    expect(validate(world, upgrade('P'))).toBe('notEnoughGold');
  });

  it('buildCost', () => {
    expect(buildCost(0)).toBe(BUILDINGS.cost[0]);
    expect(buildCost(2)).toBe(BUILDINGS.cost[2]);
    expect(buildCost(3)).toBeNull();
  });
});
