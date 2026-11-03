import { describe, expect, it } from 'vitest';
import { aiParamsFromLevel, aiStep, createAi } from '../src/core/ai/EnemyAI';
import { validateLevel } from '../src/core/level/schema';
import { step } from '../src/core/sim/tick';
import { createWorld } from '../src/core/sim/World';
import { CHAPTERS, nextLevel, getLevel, ALL_LEVELS } from '../src/levels';

describe('chapter 1', () => {
  const chapter = CHAPTERS[0]!;

  it('has 10 levels in order, ids c01_l01..c01_l10', () => {
    expect(chapter.map((l) => l.id)).toEqual(Array.from({ length: 10 }, (_, i) => `c01_l${String(i + 1).padStart(2, '0')}`));
  });

  it('levels 1–5 have a tutorial, 6–10 do not', () => {
    chapter.forEach((l, i) => expect(Boolean(l.tutorial), l.id).toBe(i < 5));
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

describe('difficulty sanity: an AI playing for the player beats the level AI', () => {
  // "Chapter 1 is passable without upgrades" (BALANCE.md): a mid-level AI with no meta bonuses
  // should win most battles, and battles should not drag on.
  it.each(ALL_LEVELS.filter((l) => l.chapter === 1).map((l) => [l.id, l] as const))('%s', (_id, level) => {
    let wins = 0;
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const seed of seeds) {
      const world = createWorld(level, { seed });
      const player = createAi('player', { thinkMs: 1500, aggression: 0.5 });
      const enemy = createAi('enemy', aiParamsFromLevel(level.enemy));
      while (!world.winner && world.tick < 6000) step(world, [...aiStep(world, player), ...aiStep(world, enemy)]);
      expect(world.winner, `${level.id} seed ${seed} did not finish in 10 min`).not.toBeNull();
      if (world.winner === 'player') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(4);
  });
});
