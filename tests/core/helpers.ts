import type { LevelData, LevelNode } from '../../src/core/level/schema';
import { step, type TickEvent } from '../../src/core/sim/tick';
import type { Command } from '../../src/core/sim/commands';
import { buildRoute, spawnUnit } from '../../src/core/sim/units';
import { createWorld, type Owner, type UnitState, type World, type WorldOptions } from '../../src/core/sim/World';

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

/** Units of `owner` on the field. */
export function unitsOf(world: World, owner: Owner): UnitState[] {
  return world.units.filter((u) => u.owner === owner);
}

/** Steps until nothing is on the field or in a stream (or `maxTicks`); returns all events. */
export function drain(world: World, maxTicks = 600): TickEvent[] {
  const events: TickEvent[] = [];
  for (let i = 0; i < maxTicks && !world.winner && (world.units.length > 0 || world.streams.length > 0); i++) {
    events.push(...step(world));
  }
  return events;
}

/** Puts a unit on the road directly (tests of clashes and arrivals): `progress` along the first segment. */
export function placeUnit(world: World, owner: Owner, path: string[], progress: number): UnitState {
  return spawnUnit(world, owner, buildRoute(world, path), progress);
}

/** Events of one type. */
export function eventsOf<T extends TickEvent['type']>(events: readonly TickEvent[], type: T): Extract<TickEvent, { type: T }>[] {
  return events.filter((e): e is Extract<TickEvent, { type: T }> => e.type === type);
}
