import { describe, expect, it } from 'vitest';
import { aiParamsFromLevel, aiStep, createAi } from '../src/core/ai/EnemyAI';
import { validateLevel, type LevelData } from '../src/core/level/schema';
import { buildCost } from '../src/core/sim/commands';
import { previewAttack } from '../src/core/sim/preview';
import { spellCost } from '../src/core/sim/spells';
import { step, type TickEvent } from '../src/core/sim/tick';
import { createWorld, type World } from '../src/core/sim/World';
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

describe('lesson 1 (TUTORIAL.md T-5)', () => {
  it('n2 is not taken by one node, but is by a swipe through both (1–6 s after n1 falls)', () => {
    const world = createWorld(getLevel('c01_l01')!, { seed: 1 });
    step(world, [{ type: 'send', side: 'player', from: 'player', to: 'n1' }]);
    for (let i = 0; i < 300 && world.nodes.n1!.owner !== 'player'; i++) step(world);
    expect(world.nodes.n1!.owner).toBe('player');
    for (let sec = 1; sec <= 6; sec++) {
      for (let i = 0; i < 10; i++) step(world);
      expect(previewAttack(world, 'player', ['player'], 'swipe', 'n2').wins, `${sec} s`).toBe(false);
      expect(previewAttack(world, 'player', ['n1'], 'swipe', 'n2').wins, `${sec} s`).toBe(false);
      expect(previewAttack(world, 'player', ['player', 'n1'], 'swipe', 'n2').wins, `${sec} s`).toBe(true);
    }
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
 * Lessons 1–3 and 5: 10/10; consolidation 4 and 6: 8–9/10; 7–9: 6–8/10; 10: 5–7/10. Battles end within 10 minutes.
 */
const WIN_CORRIDOR: Record<number, readonly [number, number]> = {
  1: [10, 10],
  2: [10, 10],
  3: [10, 10],
  4: [8, 9],
  5: [10, 10],
  6: [8, 9],
  7: [6, 8],
  8: [6, 8],
  9: [6, 8],
  10: [5, 7],
};

/** Gold the player spent on purchases (buildings, upgrades, spells) applied in one tick, and their number. */
function purchases(world: World, events: readonly TickEvent[]): { spent: number; count: number } {
  let spent = 0;
  let count = 0;
  for (const e of events) {
    if (e.type !== 'applied' || e.command.side !== 'player') continue;
    const c = e.command;
    // After the tick an upgraded building is one level up: the upgrade cost the price of its previous level.
    if (c.type === 'build') spent += buildCost(0)!;
    else if (c.type === 'upgrade') spent += buildCost((world.nodes[c.nodeId]!.building!.level - 1) as 1 | 2)!;
    else if (c.type === 'cast') spent += spellCost(c.spell);
    else continue;
    count++;
  }
  return { spent, count };
}

interface LevelRun {
  /** Wins of the AI player over seeds 1..10. */
  won: number;
  /** Per battle, on average: gold the AI player earned (income, chests, neutral captures) and purchases made. */
  gold: number;
  buys: number;
}

const runs = new Map<string, LevelRun>();

function runLevel(level: LevelData): LevelRun {
  const cached = runs.get(level.id);
  if (cached) return cached;
  let won = 0;
  let gold = 0;
  let buys = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const world = createWorld(level, { seed });
    const player = createAi('player', { thinkMs: 1200, aggression: 0.6 });
    const enemy = createAi('enemy', aiParamsFromLevel(level.enemy, world.goal, world.capitals.player));
    while (!world.winner && world.tick < 6000) {
      const before = world.sides.player.gold;
      const events = step(world, [...aiStep(world, player), ...aiStep(world, enemy)]);
      const bought = purchases(world, events);
      gold += world.sides.player.gold - before + bought.spent;
      buys += bought.count;
    }
    expect(world.winner, `${level.id} seed ${seed} did not finish in 10 min`).not.toBeNull();
    if (world.winner === 'player') won++;
  }
  const run = { won, gold: gold / 10, buys: buys / 10 };
  runs.set(level.id, run);
  return run;
}

describe('chapter 1 difficulty curve', () => {
  it.each(CHAPTERS[0]!.map((l) => [l.id, l] as const))('%s', (_id, level) => {
    const [min, max] = WIN_CORRIDOR[level.index]!;
    const { won } = runLevel(level);
    expect(won, `${level.id}: ${won}/10`).toBeGreaterThanOrEqual(min);
    expect(won, `${level.id}: ${won}/10`).toBeLessThanOrEqual(max);
  });

  // PLAYTEST-1 F-4: 4–5 gold decisions a battle on levels 4–10, i.e. at least 120 gold earned on average.
  it('levels 4–10: the AI player earns at least 120 gold a battle on average', () => {
    const levels = CHAPTERS[0]!.filter((l) => l.index >= 4);
    const gold = levels.map((l) => runLevel(l).gold);
    const avg = gold.reduce((a, b) => a + b, 0) / gold.length;
    expect(avg, levels.map((l, i) => `${l.index}: ${Math.round(gold[i]!)} gold, ${runLevel(l).buys} buys`).join('; ')).toBeGreaterThanOrEqual(120);
  });
});
