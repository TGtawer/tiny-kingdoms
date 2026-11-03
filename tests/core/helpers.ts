import type { LevelData, LevelNode } from '../../src/core/level/schema';
import { step } from '../../src/core/sim/tick';
import type { Command } from '../../src/core/sim/commands';
import { createWorld, type World, type WorldOptions } from '../../src/core/sim/World';

export function node(id: string, x: number, y: number, extra: Partial<LevelNode> = {}): LevelNode {
  return {
    id,
    x,
    y,
    size: 'small',
    owner: 'neutral',
    troops: 0,
    hasGoldVein: false,
    building: null,
    ...extra,
  };
}

export function level(nodes: LevelNode[], roads: Array<[string, string]>, extra: Partial<LevelData> = {}): LevelData {
  return {
    id: 'test',
    chapter: 1,
    index: 1,
    nodes,
    roads,
    enemy: { productionMult: 1, aiThinkMs: 1000, aggression: 0.5, startGold: 0 },
    playerStartGold: 0,
    ...extra,
  };
}

/**
 * Line P — N — E at x = 0.1, 0.5, 0.9 (distances 0.4).
 * P = player, N = neutral, E = enemy.
 */
export function lineWorld(
  overrides: { P?: Partial<LevelNode>; N?: Partial<LevelNode>; E?: Partial<LevelNode> } = {},
  levelExtra: Partial<LevelData> = {},
  options: WorldOptions = {},
): World {
  return createWorld(
    level(
      [
        node('P', 0.1, 0.5, { owner: 'player', troops: 10, ...overrides.P }),
        node('N', 0.5, 0.5, { owner: 'neutral', troops: 5, ...overrides.N }),
        node('E', 0.9, 0.5, { owner: 'enemy', troops: 10, ...overrides.E }),
      ],
      [
        ['P', 'N'],
        ['N', 'E'],
      ],
      levelExtra,
    ),
    options,
  );
}

/** Runs `ticks` steps; commands are applied on the first one. */
export function run(world: World, ticks: number, commands: Command[] = []): void {
  for (let i = 0; i < ticks; i++) step(world, i === 0 ? commands : []);
}

/** Disables troop and gold production for both sides, to isolate other rules. */
export function freezeEconomy(world: World): World {
  for (const side of Object.values(world.sides)) {
    side.modifiers.troopProductionMult = 0;
    side.modifiers.goldIncomeMult = 0;
  }
  return world;
}
