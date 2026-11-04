import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/config/balance';
import { aiParamsFromLevel, aiStep, createAi } from '../src/core/ai/EnemyAI';
import { validateLevel, type LevelData } from '../src/core/level/schema';
import type { Command } from '../src/core/sim/commands';
import { step } from '../src/core/sim/tick';
import { createWorld } from '../src/core/sim/World';
import { CHAPTERS, DEV_LEVELS, getLevel, nextLevel } from '../src/levels';

describe('chapter 1', () => {
  const chapter = CHAPTERS[0]!;

  it('has 10 levels in order, ids c01_l01..c01_l10', () => {
    expect(chapter.map((l) => l.id)).toEqual(Array.from({ length: 10 }, (_, i) => `c01_l${String(i + 1).padStart(2, '0')}`));
  });

  it('lessons 1, 3, 5, 7, the chest on 8 and the boss on 10 have a tutorial; consolidation levels have none', () => {
    const withTutorial = chapter.filter((l) => l.tutorial).map((l) => l.index);
    expect(withTutorial).toEqual([1, 3, 5, 7, 8, 10]);
  });

  it('has no gold veins, one chest on level 8; the only boss is the mage on level 10 (TUTORIAL.md T-2, T-7)', () => {
    for (const l of chapter) {
      expect(l.nodes.filter((n) => n.hasGoldVein), l.id).toEqual([]);
      expect(l.special?.type, l.id).toBe(l.index === 10 ? 'mage' : undefined);
      expect(l.nodes.filter((n) => n.kind === 'chest').length, l.id).toBe(l.id === 'c01_l08' ? 1 : 0);
    }
  });

  it('uses 6–9 nodes per level and enemy production 0.7 (BALANCE.md, chapter 1)', () => {
    for (const l of chapter) {
      expect(l.nodes.length, l.id).toBeGreaterThanOrEqual(6);
      expect(l.nodes.length, l.id).toBeLessThanOrEqual(9);
      expect(l.enemy.productionMult, l.id).toBe(0.7);
    }
  });

  it('every level passes validation', () => {
    for (const l of chapter) expect(validateLevel(l).ok, l.id).toBe(true);
  });

  it('level order helpers', () => {
    expect(getLevel('c01_l03')?.index).toBe(3);
    expect(nextLevel('c01_l03')?.id).toBe('c01_l04');
    expect(nextLevel('c01_l10')).toBeNull();
    expect(getLevel('nope')).toBeUndefined();
  });
});

describe('dev sandbox levels', () => {
  it.each(DEV_LEVELS.map((l) => [l.id, l] as const))('%s is valid and AI vs AI ends', (_id, lvl) => {
    expect(getLevel(lvl.id)).toBe(lvl);
    const world = createWorld(lvl, { seed: 1 });
    const player = createAi('player', { thinkMs: 1200, aggression: 0.6 });
    const enemies = [createAi('enemy', aiParamsFromLevel(lvl.enemy, world.goal, world.capitals.player))];
    if (lvl.enemy2) enemies.push(createAi('enemy2', aiParamsFromLevel(lvl.enemy2)));
    while (!world.winner && world.tick < 9000) step(world, [...aiStep(world, player), ...enemies.flatMap((e) => aiStep(world, e))]);
    expect(world.winner).not.toBeNull();
  });
});

/**
 * Difficulty curve (TUTORIAL.md T-5, BALANCE.md), measured with an AI playing for the player (an active player
 * without meta bonuses: decides every 1.2 s, aggression 0.6) against the level AI, 10 seeds per level.
 * Lessons 1–3: 10/10; consolidation 4 and 6: 8–9/10; 7–9: 6–8/10; 10: 5–7/10. Battles end within 10 minutes.
 * Level 5 is the tower lesson: the player who follows it (a tower on the pass) wins 10/10,
 * a player who never builds a tower loses more often.
 */
const WIN_CORRIDOR: Record<number, readonly [number, number]> = {
  1: [10, 10],
  2: [10, 10],
  3: [10, 10],
  4: [8, 9],
  6: [8, 9],
  7: [6, 8],
  8: [6, 8],
  9: [6, 8],
  10: [5, 7],
};

type PlayerMode = 'ai' | 'towerOnPass' | 'noTower';

/** Wins of the AI player over seeds 1..10. */
function wins(level: LevelData, mode: PlayerMode = 'ai'): number {
  let won = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const world = createWorld(level, { seed });
    const player = createAi('player', { thinkMs: 1200, aggression: 0.6 });
    const enemy = createAi('enemy', aiParamsFromLevel(level.enemy, world.goal, world.capitals.player));
    let towerBuilt = false;
    while (!world.winner && world.tick < 6000) {
      let cmds: Command[] = aiStep(world, player);
      if (mode === 'noTower') cmds = cmds.filter((c) => !(c.type === 'build' && c.building === 'tower'));
      const pass = world.nodes.neck;
      if (mode === 'towerOnPass' && !towerBuilt && pass?.owner === 'player' && !pass.building && world.sides.player.gold >= BUILDINGS.cost[0]) {
        // What the lesson teaches: the first building goes on the pass, as a tower.
        cmds = [{ type: 'build', side: 'player', nodeId: 'neck', building: 'tower' }, ...cmds.filter((c) => c.type !== 'build')];
        towerBuilt = true;
      }
      step(world, [...cmds, ...aiStep(world, enemy)]);
    }
    expect(world.winner, `${level.id} seed ${seed} did not finish in 10 min`).not.toBeNull();
    if (world.winner === 'player') won++;
  }
  return won;
}

describe('chapter 1 difficulty curve', () => {
  it.each(CHAPTERS[0]!.filter((l) => l.index !== 5).map((l) => [l.id, l] as const))('%s', (_id, level) => {
    const [min, max] = WIN_CORRIDOR[level.index]!;
    const won = wins(level);
    expect(won, `${level.id}: ${won}/10`).toBeGreaterThanOrEqual(min);
    expect(won, `${level.id}: ${won}/10`).toBeLessThanOrEqual(max);
  });

  it('c01_l05: a tower on the pass holds; without towers the player loses more often', () => {
    const level = getLevel('c01_l05')!;
    expect(level.goal).toEqual({ type: 'survive', seconds: 90 });
    const withTower = wins(level, 'towerOnPass');
    const without = wins(level, 'noTower');
    expect(withTower).toBe(10);
    expect(without).toBeLessThanOrEqual(withTower - 3);
  });
});
