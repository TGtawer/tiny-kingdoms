import { describe, expect, it } from 'vitest';
import { BUILDINGS, LEADERS, TICK_MS, type LeaderId } from '../../../src/config/balance';
import { aiParamsFromLevel, aiStep, createAi, recentDrop, type AiState } from '../../../src/core/ai/EnemyAI';
import { validateLevel } from '../../../src/core/level/schema';
import type { Command } from '../../../src/core/sim/commands';
import { step } from '../../../src/core/sim/tick';
import { createWorld, type World } from '../../../src/core/sim/World';
import { level, lineWorld, node } from '../helpers';

const leaderAi = (leader: LeaderId): AiState => createAi('enemy', aiParamsFromLevel({ productionMult: 1, startGold: 0, leader }));

/** The AI's next decision right now. */
function decide(world: World, ai: AiState): Command[] {
  ai.nextThinkTick = world.tick;
  return aiStep(world, ai);
}

/** Player P — neutral N — enemy E, with a gold vein on E and a far rear enemy node R. */
function arena(): World {
  return createWorld(
    level(
      [
        node('P', 0.1, 0.5, { owner: 'player', troops: 10 }),
        node('N', 0.4, 0.5, { troops: 3 }),
        node('E', 0.7, 0.5, { owner: 'enemy', troops: 20, size: 'large', hasGoldVein: true }),
        node('R', 0.95, 0.5, { owner: 'enemy', troops: 5 }),
      ],
      [
        ['P', 'N'],
        ['N', 'E'],
        ['E', 'R'],
      ],
    ),
  );
}

describe('leader presets', () => {
  it('level fields override the preset', () => {
    expect(aiParamsFromLevel({ productionMult: 1, startGold: 0, leader: 'king' })).toMatchObject({
      leader: 'king',
      aggression: LEADERS.king.aggression,
      thinkMs: LEADERS.king.thinkMs,
    });
    expect(aiParamsFromLevel({ productionMult: 1, startGold: 0, leader: 'king', aggression: 0.9, aiThinkMs: 700 })).toMatchObject({
      aggression: 0.9,
      thinkMs: 700,
    });
  });

  it('schema: aggression and think interval may be omitted only with a leader; unknown leaders fail', () => {
    const l = level(
      [node('p', 0.1, 0.5, { owner: 'player' }), node('n', 0.5, 0.5), node('e', 0.9, 0.5, { owner: 'enemy' })],
      [
        ['p', 'n'],
        ['n', 'e'],
      ],
    );
    l.enemy = { productionMult: 1, startGold: 0, leader: 'baron' };
    expect(validateLevel(l).ok).toBe(true);
    l.enemy = { productionMult: 1, startGold: 0 };
    expect(validateLevel(l).ok).toBe(false);
    l.enemy = { productionMult: 1, startGold: 0, leader: 'pirate' as LeaderId };
    expect(validateLevel(l).ok).toBe(false);
  });
});

describe('dwarf (builder)', () => {
  it('builds a mine before its first attack, and does not attack early', () => {
    const world = arena();
    world.sides.enemy.gold = BUILDINGS.cost[0];
    const ai = leaderAi('dwarf');
    let firstBuild = Infinity;
    let firstAttack = Infinity;
    const attackAfterTicks = LEADERS.dwarf.attackAfterMs / TICK_MS;
    while (world.tick < attackAfterTicks + 300 && !world.winner) {
      const cmds = aiStep(world, ai);
      if (cmds.some((c) => c.type === 'build') && firstBuild === Infinity) firstBuild = world.tick;
      if (cmds.some((c) => c.type === 'send' && world.nodes[c.to]!.owner !== 'enemy') && firstAttack === Infinity) firstAttack = world.tick;
      step(world, cmds);
    }
    expect(firstBuild).toBeLessThan(firstAttack);
    expect(firstAttack).toBeGreaterThanOrEqual(attackAfterTicks);
    expect(world.nodes.E!.building?.type).toBe('mine');
  });
});

describe('baron (aggressor)', () => {
  it('attacks a node the king leaves alone', () => {
    const world = lineWorld({ P: { troops: 8 }, N: { owner: 'player', troops: 8 }, E: { troops: 18 } });
    world.tick = 10;
    const baron = decide(structuredClone(world), leaderAi('baron'));
    const king = decide(structuredClone(world), leaderAi('king'));
    expect(baron.some((c) => c.type === 'send' && c.to === 'N')).toBe(true);
    expect(king.some((c) => c.type === 'send' && c.to === 'N')).toBe(false);
  });

  it('hardly builds: keeps a big reserve', () => {
    const world = arena();
    world.tick = 10;
    world.sides.enemy.gold = BUILDINGS.cost[0] + LEADERS.baron.buildReserve - 1;
    expect(decide(world, leaderAi('baron')).filter((c) => c.type === 'build')).toEqual([]);
    world.sides.enemy.gold = BUILDINGS.cost[0] + LEADERS.baron.buildReserve;
    expect(decide(world, leaderAi('baron'))).toContainEqual(expect.objectContaining({ type: 'build', building: 'barracks' }));
  });
});

describe('king (defender)', () => {
  it('puts towers on the front line after the mine, where others build barracks in the rear', () => {
    const world = arena();
    // F: an empty enemy node on the border (next to the neutral N).
    world.nodes.F = { ...world.nodes.R!, id: 'F', x: 0.55, y: 0.8, troops: 5 };
    world.roads.push(['N', 'F'], ['F', 'E']);
    world.tick = 10;
    world.nodes.E!.building = { type: 'mine', level: 1 };
    world.sides.enemy.gold = BUILDINGS.cost[0];
    expect(decide(structuredClone(world), leaderAi('king'))).toContainEqual({ type: 'build', side: 'enemy', nodeId: 'F', building: 'tower' });
    const plain = createAi('enemy', { thinkMs: 1000, aggression: LEADERS.king.aggression });
    expect(decide(world, plain)).toContainEqual({ type: 'build', side: 'enemy', nodeId: 'R', building: 'barracks' });
  });

  it('counter-attacks right after being attacked', () => {
    const world = lineWorld({ P: { troops: 8 }, N: { owner: 'player', troops: 8 }, E: { troops: 24 } });
    world.tick = 10;
    const ai = leaderAi('king');
    expect(decide(structuredClone(world), ai).some((c) => c.type === 'send' && c.to === 'N')).toBe(false);
    // A player army heads for E: the king answers without the extra margin.
    world.armies.push({ id: 'a', owner: 'player', count: 1, path: ['N', 'E'], segment: 0, progress: 0.1, targetId: 'E' });
    expect(decide(world, ai).some((c) => c.type === 'send' && c.to === 'N')).toBe(true);
  });
});

describe('witch (opportunist)', () => {
  it('recentDrop sees a node that just sent its troops', () => {
    const snaps = [{ A: 20 }, { A: 20 }];
    expect(recentDrop(snaps, 'A', 6)).toBe(14);
    expect(recentDrop(snaps, 'A', 17)).toBe(0); // small drop
    expect(recentDrop([], 'A', 6)).toBe(0);
  });

  it('prefers the player node that just emptied itself', () => {
    // Two equal player nodes A and B next to the witch's node W; A just sent most of its troops.
    const world = createWorld(
      level(
        [
          node('A', 0.3, 0.3, { owner: 'player', troops: 10 }),
          node('B', 0.3, 0.7, { owner: 'player', troops: 6 }),
          node('W', 0.6, 0.5, { owner: 'enemy', troops: 30 }),
        ],
        [
          ['A', 'W'],
          ['B', 'W'],
        ],
      ),
    );
    const witch = leaderAi('witch');
    const plain = createAi('enemy', { thinkMs: LEADERS.witch.thinkMs, aggression: LEADERS.witch.aggression });
    for (const ai of [witch, plain]) ai.snapshots = [{ A: 22, B: 6, W: 30 }];
    world.nodes.A!.troops = 7;
    world.nodes.B!.troops = 6;
    world.tick = 11;
    const target = (ai: AiState) => decide(structuredClone(world), ai).find((c) => c.type === 'send')?.to;
    expect(target(plain)).toBe('B');
    expect(target(witch)).toBe('A');
  });
});
