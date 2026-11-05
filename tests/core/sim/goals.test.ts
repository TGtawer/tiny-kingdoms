import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../../../src/config/balance';
import { aiParamsFromLevel, aiStep, createAi } from '../../../src/core/ai/EnemyAI';
import { validateLevel, type LevelData } from '../../../src/core/level/schema';
import { step, type TickEvent } from '../../../src/core/sim/tick';
import { checkOutcome, goalProgressSec, type Goal } from '../../../src/core/sim/victory';
import { createWorld, reindexRoads } from '../../../src/core/sim/World';
import { ALL_LEVELS } from '../../../src/levels';
import { freezeEconomy, level, node } from '../helpers';

const ticks = (sec: number): number => (sec * 1000) / TICK_MS;

// P(player capital) — H — E(enemy capital), plus an enemy rear node R.
function goalLevel(goal: Goal): LevelData {
  return level(
    [
      node('P', 0.1, 0.5, { owner: 'player', troops: 10, capital: true }),
      node('H', 0.5, 0.5, { troops: 0 }),
      node('E', 0.8, 0.5, { owner: 'enemy', troops: 10, capital: true }),
      node('R', 0.95, 0.8, { owner: 'enemy', troops: 10 }),
    ],
    [
      ['P', 'H'],
      ['H', 'E'],
      ['E', 'R'],
    ],
    { goal },
  );
}

describe('goals', () => {
  it('conquer is the default', () => {
    const world = createWorld(goalLevel({ type: 'conquer' }));
    expect(createWorld(level(goalLevel({ type: 'conquer' }).nodes, goalLevel({ type: 'conquer' }).roads)).goal).toEqual({ type: 'conquer' });
    expect(checkOutcome(world)).toBeNull();
  });

  it('hold: win after holding the node long enough; losing it restarts the timer', () => {
    const world = freezeEconomy(createWorld(goalLevel({ type: 'hold', nodeId: 'H', seconds: 10 })));
    world.nodes.H!.owner = 'player';
    for (let i = 0; i < ticks(6); i++) step(world);
    expect(goalProgressSec(world)).toBeCloseTo(6, 6);
    world.nodes.H!.owner = 'enemy';
    step(world);
    expect(goalProgressSec(world)).toBe(0);
    world.nodes.H!.owner = 'player';
    const events: TickEvent[] = [];
    for (let i = 0; i < ticks(10) && !world.winner; i++) events.push(...step(world));
    expect(world.winner).toBe('player');
    expect(events).toContainEqual({ type: 'gameOver', winner: 'player', reason: 'hold' });
  });

  it('survive: win when the time is up', () => {
    const world = freezeEconomy(createWorld(goalLevel({ type: 'survive', seconds: 5 })));
    const events: TickEvent[] = [];
    for (let i = 0; i < ticks(5) + 1 && !world.winner; i++) events.push(...step(world));
    expect(events).toContainEqual({ type: 'gameOver', winner: 'player', reason: 'survive' });
  });

  it('capital: taking the enemy capital wins even with enemy nodes left; losing your own loses', () => {
    const win = createWorld(goalLevel({ type: 'capital' }));
    win.nodes.E!.owner = 'player';
    expect(checkOutcome(win)).toEqual({ winner: 'player', reason: 'capital' });

    const lose = createWorld(goalLevel({ type: 'capital' }));
    lose.nodes.H!.owner = 'player';
    lose.nodes.P!.owner = 'enemy';
    expect(checkOutcome(lose)).toEqual({ winner: 'enemy', reason: 'capitalLost' });

    // Without the capital goal, the same position goes on.
    const plain = createWorld(goalLevel({ type: 'conquer' }));
    plain.nodes.E!.owner = 'player';
    expect(checkOutcome(plain)).toBeNull();
  });

  it('every goal still wins by conquest and loses with no nodes', () => {
    for (const goal of [{ type: 'hold', nodeId: 'H', seconds: 99 }, { type: 'survive', seconds: 99 }] as Goal[]) {
      const world = createWorld(goalLevel(goal));
      world.nodes.E!.owner = world.nodes.R!.owner = 'neutral';
      expect(checkOutcome(world)).toEqual({ winner: 'player', reason: 'conquer' });
      world.nodes.P!.owner = 'neutral';
      expect(checkOutcome(world)).toEqual({ winner: 'enemy', reason: 'eliminated' });
    }
  });

  it('schema validation', () => {
    expect(validateLevel(goalLevel({ type: 'hold', nodeId: 'H', seconds: 30 })).ok).toBe(true);
    expect(validateLevel(goalLevel({ type: 'hold', nodeId: 'nope', seconds: 30 })).ok).toBe(false);
    expect(validateLevel(goalLevel({ type: 'survive', seconds: 0 })).ok).toBe(false);
    const noCapital = goalLevel({ type: 'capital' });
    noCapital.nodes[2]!.capital = false;
    expect(validateLevel(noCapital).ok).toBe(false);
    expect(validateLevel(goalLevel({ type: 'flag' } as unknown as Goal)).ok).toBe(false);
  });

  it('the enemy AI goes for the node to hold', () => {
    const lvl = goalLevel({ type: 'hold', nodeId: 'H', seconds: 30 });
    const world = createWorld(lvl);
    world.nodes.H!.troops = 8;
    world.nodes.E!.troops = 20;
    world.tick = 10;
    const plain = createAi('enemy', aiParamsFromLevel({ ...lvl.enemy, aggression: 0 }));
    const goalAware = createAi('enemy', aiParamsFromLevel({ ...lvl.enemy, aggression: 0 }, lvl.goal));
    // A juicier neutral elsewhere: a large node next to R.
    world.nodes.X = { ...world.nodes.H!, id: 'X', x: 0.95, y: 0.2, size: 'large', troops: 8 };
    world.roads.push(['R', 'X']);
    reindexRoads(world);
    world.nodes.R!.troops = 20;
    plain.nextThinkTick = goalAware.nextThinkTick = 10;
    const firstTarget = (ai: typeof plain) => aiStep(structuredClone(world), ai).find((c) => c.type === 'send')?.to;
    expect(firstTarget(plain)).toBe('X');
    expect(firstTarget(goalAware)).toBe('H');
  });
});

describe('goals on a real level (AI vs AI)', () => {
  const base = ALL_LEVELS[6]!; // c01_l07
  const capitalOf = (side: 'player' | 'enemy') => base.nodes.find((n) => n.capital && n.owner === side)!.id;
  const goals: Goal[] = [
    { type: 'hold', nodeId: 'a3', seconds: 30 },
    { type: 'survive', seconds: 120 },
    { type: 'capital' },
  ];

  it.each(goals.map((g) => [g.type, g] as const))('%s: battle ends', (_type, goal) => {
    expect(capitalOf('enemy')).toBeTruthy();
    for (const seed of [1, 2, 3]) {
      const lvl = { ...structuredClone(base), goal };
      expect(validateLevel(lvl).ok).toBe(true);
      const world = createWorld(lvl, { seed });
      const player = createAi('player', { thinkMs: 1200, aggression: 0.6 });
      const enemy = createAi('enemy', aiParamsFromLevel(lvl.enemy, goal, world.capitals.player));
      while (!world.winner && world.tick < ticks(15 * 60)) step(world, [...aiStep(world, player), ...aiStep(world, enemy)]);
      expect(world.winner, `${goal.type} seed ${seed}`).not.toBeNull();
    }
  });
});
