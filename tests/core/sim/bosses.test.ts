import { describe, expect, it } from 'vitest';
import { CITADEL, DRAGON, TICK_MS } from '../../../src/config/balance';
import { aiParamsFromLevel, aiStep, createAi } from '../../../src/core/ai/EnemyAI';
import { validateLevel, type LevelData } from '../../../src/core/level/schema';
import { dragonTarget } from '../../../src/core/sim/specials/dragon';
import { step, type TickEvent } from '../../../src/core/sim/tick';
import { createWorld } from '../../../src/core/sim/World';
import { ALL_LEVELS } from '../../../src/levels';
import { freezeEconomy, level, node } from '../helpers';

const ticks = (ms: number): number => Math.round(ms / TICK_MS);

function runFor(world: ReturnType<typeof createWorld>, n: number): TickEvent[] {
  const events: TickEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...step(world));
  return events;
}

const dragonLevel = (): LevelData =>
  level(
    [
      node('P', 0.1, 0.5, { owner: 'player', troops: 30 }),
      node('Q', 0.3, 0.5, { owner: 'player', troops: 10 }),
      node('N', 0.5, 0.5, { troops: 99 }),
      node('E', 0.9, 0.5, { owner: 'enemy', troops: 20 }),
    ],
    [
      ['P', 'Q'],
      ['Q', 'N'],
      ['N', 'E'],
    ],
    { special: { type: 'dragon', params: {} } },
  );

describe('dragon', () => {
  it('targets the biggest non-neutral garrison', () => {
    const world = createWorld(dragonLevel());
    expect(dragonTarget(world)!.id).toBe('P');
  });

  it('warns DRAGON.warnMs before burning half of the troops', () => {
    const world = freezeEconomy(createWorld(dragonLevel()));
    const beforeWarn = runFor(world, ticks(DRAGON.everyMs - DRAGON.warnMs) - 1);
    expect(beforeWarn.some((e) => e.type === 'dragonWarn')).toBe(false);
    const warn = runFor(world, 2);
    expect(warn).toContainEqual(expect.objectContaining({ type: 'dragonWarn', nodeId: 'P' }));
    const strike = runFor(world, ticks(DRAGON.warnMs));
    expect(strike).toContainEqual({ type: 'dragonStrike', nodeId: 'P', killed: 15 });
    expect(world.nodes.P!.troops).toBeCloseTo(15, 9);
  });

  it('the target is fixed at the warning: moving troops out saves them', () => {
    const world = freezeEconomy(createWorld(dragonLevel()));
    runFor(world, ticks(DRAGON.everyMs - DRAGON.warnMs) + 1);
    world.nodes.Q!.troops += world.nodes.P!.troops - 2;
    world.nodes.P!.troops = 2;
    const events = runFor(world, ticks(DRAGON.warnMs));
    expect(events).toContainEqual({ type: 'dragonStrike', nodeId: 'P', killed: 1 });
    expect(world.nodes.Q!.troops).toBeCloseTo(38, 9);
  });

  it('strikes again every interval', () => {
    const world = freezeEconomy(createWorld(dragonLevel()));
    const events = runFor(world, ticks(DRAGON.everyMs * 3) + 1);
    expect(events.filter((e) => e.type === 'dragonStrike')).toHaveLength(3);
  });

  it('the AI moves troops out of a marked node', () => {
    const world = createWorld(dragonLevel());
    world.nodes.E!.troops = 40;
    world.nodes.F = { ...world.nodes.E!, id: 'F', x: 0.9, y: 0.8, troops: 5 };
    world.roads.push(['E', 'F']);
    world.boss = { type: 'dragon', strikeTick: 999, targetId: 'E' };
    world.tick = 10;
    const ai = createAi('enemy', { thinkMs: 100, aggression: 0 });
    ai.nextThinkTick = 10;
    expect(aiStep(world, ai)).toContainEqual(expect.objectContaining({ type: 'send', from: 'E', to: 'F' }));
  });

  it('chapter 1 level 10 is the dragon and AI vs AI still ends', () => {
    const l10 = ALL_LEVELS[9]!;
    expect(l10.special?.type).toBe('dragon');
    for (const seed of [1, 2, 3]) {
      const world = createWorld(l10, { seed });
      const p = createAi('player', { thinkMs: 1200, aggression: 0.6 });
      const e = createAi('enemy', aiParamsFromLevel(l10.enemy));
      let strikes = 0;
      while (!world.winner && world.tick < ticks(15 * 60 * 1000)) {
        strikes += step(world, [...aiStep(world, p), ...aiStep(world, e)]).filter((ev) => ev.type === 'dragonStrike').length;
      }
      expect(world.winner).not.toBeNull();
      expect(strikes).toBeGreaterThan(0);
    }
  });
});

const citadelLevel = (): LevelData =>
  level(
    [
      node('P', 0.1, 0.5, { owner: 'player', troops: 20, capital: true }),
      node('N', 0.4, 0.5, { troops: 5 }),
      node('C', 0.8, 0.5, {
        owner: 'enemy',
        troops: 150,
        size: 'large',
        kind: 'fortress',
        capital: true,
        building: { type: 'barracks', level: 3 },
      }),
      node('F', 0.6, 0.8, { owner: 'enemy', troops: 5 }),
    ],
    [
      ['P', 'N'],
      ['N', 'C'],
      ['C', 'F'],
      ['F', 'P'],
    ],
    { special: { type: 'citadel', params: { nodeId: 'C' } }, goal: { type: 'capital' } },
  );

describe('citadel', () => {
  it('validates and sends a squad of waveSize to the nearest reachable player node', () => {
    expect(validateLevel(citadelLevel()).ok).toBe(true);
    const world = freezeEconomy(createWorld(citadelLevel()));
    const garrison = world.nodes.C!.troops;
    const events = runFor(world, ticks(CITADEL.waveEveryMs) + 1);
    const wave = events.find((e) => e.type === 'citadelWave');
    // N is neutral, so the route goes through the own node F.
    expect(wave).toMatchObject({ from: 'C', to: 'P', count: CITADEL.waveSize });
    expect(world.nodes.C!.troops).toBe(garrison); // extra troops, not from the garrison
  });

  it('stops once the citadel is lost', () => {
    const world = freezeEconomy(createWorld(citadelLevel()));
    world.nodes.C!.owner = 'neutral';
    const events = runFor(world, ticks(CITADEL.waveEveryMs) + 1);
    expect(events.some((e) => e.type === 'citadelWave')).toBe(false);
  });

  it('rejects a citadel that is not an enemy node', () => {
    const l = citadelLevel();
    l.special = { type: 'citadel', params: { nodeId: 'N' } };
    expect(validateLevel(l).ok).toBe(false);
  });

  it('AI vs AI on the citadel level ends', () => {
    for (const seed of [1, 2]) {
      const lvl = citadelLevel();
      const world = createWorld(lvl, { seed });
      const p = createAi('player', { thinkMs: 1200, aggression: 0.6 });
      const e = createAi('enemy', aiParamsFromLevel(lvl.enemy, lvl.goal, world.capitals.player));
      while (!world.winner && world.tick < ticks(15 * 60 * 1000)) step(world, [...aiStep(world, p), ...aiStep(world, e)]);
      expect(world.winner).not.toBeNull();
    }
  });
});
