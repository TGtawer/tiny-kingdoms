import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../../../src/config/balance';
import { aiParamsFromLevel, aiStep, createAi } from '../../../src/core/ai/EnemyAI';
import { validateLevel, type LevelData } from '../../../src/core/level/schema';
import { validate } from '../../../src/core/sim/commands';
import { step, type TickEvent } from '../../../src/core/sim/tick';
import { checkOutcome } from '../../../src/core/sim/victory';
import { createWorld } from '../../../src/core/sim/World';
import { level, node } from '../helpers';

// Chapter-1-like enemies (production 0.7), so the three-way fight resolves.
const enemy2 = { productionMult: 0.7, aiThinkMs: 1500, aggression: 0.6, startGold: 0 };

/**
 * Triangle: player P at the bottom left, enemy E at the right, enemy2 G at the top left,
 * neutrals in between. E and G border each other through M.
 */
function threeSideLevel(): LevelData {
  return level(
    [
      node('P', 0.1, 0.9, { owner: 'player', troops: 15, size: 'large' }),
      node('A', 0.3, 0.7, { troops: 4 }),
      node('E', 0.9, 0.5, { owner: 'enemy', troops: 15, size: 'large' }),
      node('B', 0.7, 0.5, { troops: 4 }),
      node('G', 0.1, 0.1, { owner: 'enemy2', troops: 15, size: 'large' }),
      node('C', 0.3, 0.3, { troops: 4 }),
      node('M', 0.5, 0.35, { troops: 2 }),
    ],
    [
      ['P', 'A'],
      ['A', 'B'],
      ['B', 'E'],
      ['G', 'C'],
      ['C', 'M'],
      ['M', 'B'],
      ['A', 'C'],
    ],
    { enemy2, enemy: { ...enemy2 } },
  );
}

describe('three sides', () => {
  it('schema: enemy2 nodes need enemy2 params', () => {
    expect(validateLevel(threeSideLevel()).ok).toBe(true);
    const l = threeSideLevel();
    delete l.enemy2;
    expect(validateLevel(l).ok).toBe(false);
  });

  it('the player wins only when both enemies are gone', () => {
    const world = createWorld(threeSideLevel());
    world.nodes.E!.owner = 'neutral';
    expect(checkOutcome(world)).toBeNull();
    world.nodes.G!.owner = 'neutral';
    expect(checkOutcome(world)).toEqual({ winner: 'player', reason: 'conquer' });
  });

  it('a defeat names the stronger enemy', () => {
    const world = createWorld(threeSideLevel());
    world.nodes.P!.owner = 'enemy2';
    expect(checkOutcome(world)).toEqual({ winner: 'enemy2', reason: 'eliminated' });
  });

  it('fireball can hit either enemy', () => {
    const world = createWorld(threeSideLevel(), { player: { unlockedSpells: ['fireball'] } });
    world.sides.player.gold = 999;
    expect(validate(world, { type: 'cast', side: 'player', spell: 'fireball', nodeId: 'G' })).toBeNull();
    expect(validate(world, { type: 'cast', side: 'player', spell: 'fireball', nodeId: 'E' })).toBeNull();
    expect(validate(world, { type: 'cast', side: 'player', spell: 'fireball', nodeId: 'A' })).toBe('invalidTarget');
  });

  it('armies of the two enemies clash on a road', () => {
    const world = createWorld(threeSideLevel());
    world.nodes.B!.owner = 'enemy';
    world.nodes.M!.owner = 'enemy2';
    world.nodes.B!.troops = 10;
    world.nodes.M!.troops = 10;
    const events: TickEvent[] = [
      ...step(world, [
        { type: 'send', side: 'enemy', from: 'B', to: 'M', mode: 'swipe' },
        { type: 'send', side: 'enemy2', from: 'M', to: 'B', mode: 'swipe' },
      ]),
    ];
    for (let i = 0; i < 40; i++) events.push(...step(world));
    expect(events.some((e) => e.type === 'clash')).toBe(true);
  });

  it('the AIs fight each other and the battle ends', () => {
    let enemiesFought = 0;
    for (const seed of [1, 2, 3]) {
      const lvl = threeSideLevel();
      const world = createWorld(lvl, { seed });
      const p = createAi('player', { thinkMs: 1200, aggression: 0.6 });
      const e = createAi('enemy', aiParamsFromLevel(lvl.enemy));
      const g = createAi('enemy2', aiParamsFromLevel(lvl.enemy2!));
      const owners = new Map(Object.values(world.nodes).map((n) => [n.id, n.owner]));
      while (!world.winner && world.tick < (15 * 60 * 1000) / TICK_MS) {
        const events = step(world, [...aiStep(world, p), ...aiStep(world, e), ...aiStep(world, g)]);
        for (const ev of events) {
          if (ev.type === 'arrived' && ev.outcome === 'captured') {
            const before = owners.get(ev.nodeId);
            const after = world.nodes[ev.nodeId]!.owner;
            if ((before === 'enemy' && after === 'enemy2') || (before === 'enemy2' && after === 'enemy')) enemiesFought++;
          }
          if (ev.type === 'clash') {
            const sides = ev.armies.map((id) => world.armies.find((a) => a.id === id)?.owner);
            if (sides.includes('enemy') && sides.includes('enemy2')) enemiesFought++;
          }
        }
        for (const n of Object.values(world.nodes)) owners.set(n.id, n.owner);
      }
      expect(world.winner, `seed ${seed}`).not.toBeNull();
    }
    expect(enemiesFought).toBeGreaterThan(0);
  });

  it('the AI targets the second enemy like the player', () => {
    const world = createWorld(threeSideLevel());
    world.nodes.B!.owner = 'enemy';
    world.nodes.B!.troops = 30;
    world.nodes.A!.owner = 'enemy2';
    world.nodes.A!.troops = 3;
    world.tick = 10;
    const ai = createAi('enemy', { thinkMs: 100, aggression: 1 });
    ai.nextThinkTick = 10;
    expect(aiStep(world, ai)).toContainEqual(expect.objectContaining({ type: 'send', side: 'enemy', to: 'A' }));
  });
});
