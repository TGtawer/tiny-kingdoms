import { describe, expect, it } from 'vitest';
import { aiParamsFromLevel, aiStep, createAi } from '../src/core/ai/EnemyAI';
import { validateLevel } from '../src/core/level/schema';
import { step } from '../src/core/sim/tick';
import { createWorld } from '../src/core/sim/World';
import { CHAPTERS, getLevel, nextLevel } from '../src/levels';

describe('chapter 1', () => {
  const chapter = CHAPTERS[0]!;

  it('has 10 levels in order, ids c01_l01..c01_l10', () => {
    expect(chapter.map((l) => l.id)).toEqual(Array.from({ length: 10 }, (_, i) => `c01_l${String(i + 1).padStart(2, '0')}`));
  });

  it('levels 1–5 have a tutorial; 6 introduces the chest; 7–10 have none', () => {
    chapter.forEach((l, i) => expect(Boolean(l.tutorial), l.id).toBe(i < 6));
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

/**
 * Difficulty curve, measured with an AI playing for the player (an active player without meta bonuses:
 * decides every 1.2 s, aggression 0.6) against the level AI, 10 seeds per level.
 * - "Chapter 1 is passable without upgrades" (BALANCE.md): at least 4/10 wins everywhere.
 * - Tutorial levels 1–3 stay easy: at least 9/10.
 * - Saw-tooth (BALANCE.md): levels 7–9 must not be a walkover: at most 8/10.
 * - Battles end within 10 minutes of game time.
 */
describe('chapter 1 difficulty curve', () => {
  it.each(CHAPTERS[0]!.map((l) => [l.id, l] as const))('%s', (_id, level) => {
    let wins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const world = createWorld(level, { seed });
      const player = createAi('player', { thinkMs: 1200, aggression: 0.6 });
      const enemy = createAi('enemy', aiParamsFromLevel(level.enemy));
      while (!world.winner && world.tick < 6000) step(world, [...aiStep(world, player), ...aiStep(world, enemy)]);
      expect(world.winner, `${level.id} seed ${seed} did not finish in 10 min`).not.toBeNull();
      if (world.winner === 'player') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(level.index <= 3 ? 9 : 4);
    if (level.index >= 7 && level.index <= 9) expect(wins).toBeLessThanOrEqual(8);
  });
});
