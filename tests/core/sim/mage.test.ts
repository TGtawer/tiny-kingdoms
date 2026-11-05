import { describe, expect, it } from 'vitest';
import { MAGE, TICK_MS } from '../../../src/config/balance';
import { aiParamsFromLevel, aiStep, createAi } from '../../../src/core/ai/EnemyAI';
import { defaultProgress } from '../../../src/core/meta/Progress';
import { grantWinSpells } from '../../../src/core/meta/spellbook';
import { validateLevel, type LevelData } from '../../../src/core/level/schema';
import { mageDamage, mageTarget } from '../../../src/core/sim/specials/mage';
import { step, type TickEvent } from '../../../src/core/sim/tick';
import { createWorld, type World } from '../../../src/core/sim/World';
import { getLevel } from '../../../src/levels';
import { freezeEconomy, level, node } from '../helpers';

const ticks = (ms: number): number => Math.round(ms / TICK_MS);

function runFor(world: World, n: number): TickEvent[] {
  const events: TickEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...step(world));
  return events;
}

/** P, Q (player) — N (neutral, big) — E (enemy), T: the mage tower (enemy capital). */
const mageLevel = (): LevelData =>
  level(
    [
      node('P', 0.1, 0.5, { owner: 'player', troops: 30, capital: true }),
      node('Q', 0.3, 0.5, { owner: 'player', troops: 10 }),
      node('N', 0.5, 0.5, { troops: 99 }),
      node('E', 0.7, 0.5, { owner: 'enemy', troops: 60 }),
      node('T', 0.9, 0.5, { owner: 'enemy', troops: 20, capital: true }),
    ],
    [
      ['P', 'Q'],
      ['Q', 'N'],
      ['N', 'E'],
      ['E', 'T'],
    ],
    { special: { type: 'mage', params: {} }, goal: { type: 'capital' } },
  );

describe('evil mage (TUTORIAL.md T-7)', () => {
  it('is valid level data only with an enemy capital (the tower)', () => {
    expect(validateLevel(mageLevel()).ok).toBe(true);
    const noTower = mageLevel();
    noTower.nodes = noTower.nodes.map((n) => ({ ...n, capital: false }));
    noTower.goal = { type: 'conquer' };
    expect(validateLevel(noTower).ok).toBe(false);
  });

  it('targets the player node with the biggest garrison, never enemy or neutral nodes', () => {
    const world = createWorld(mageLevel());
    expect(mageTarget(world)!.id).toBe('P');
    world.nodes.Q!.troops = 50;
    expect(mageTarget(world)!.id).toBe('Q');
  });

  it('warns MAGE.warnMs before each strike, every MAGE.everyMs', () => {
    const world = freezeEconomy(createWorld(mageLevel()));
    const beforeWarn = runFor(world, ticks(MAGE.everyMs - MAGE.warnMs) - 1);
    expect(beforeWarn.some((e) => e.type === 'mageWarning' || e.type === 'mageStrike')).toBe(false);
    const warn = runFor(world, 2);
    expect(warn).toContainEqual(expect.objectContaining({ type: 'mageWarning', nodeId: 'P' }));
    const toStrike = runFor(world, ticks(MAGE.warnMs));
    expect(toStrike).toContainEqual({ type: 'mageStrike', nodeId: 'P', killed: 12, from: 'T' });
    expect(world.nodes.P!.troops).toBe(18);
    const more = runFor(world, ticks(MAGE.everyMs) * 2);
    expect(more.filter((e) => e.type === 'mageStrike')).toHaveLength(2);
  });

  it('destroys MAGE.damageShare of the garrison, at least MAGE.damageMin, never more than there is', () => {
    expect(mageDamage(30)).toBeCloseTo(30 * MAGE.damageShare);
    expect(mageDamage(5)).toBe(MAGE.damageMin);
    expect(mageDamage(2)).toBe(2);
  });

  it('a shield takes the hit; a node lost before the strike is spared', () => {
    const shielded = freezeEconomy(createWorld(mageLevel()));
    runFor(shielded, ticks(MAGE.everyMs) - 2);
    shielded.nodes.P!.shieldTicks = 50;
    expect(runFor(shielded, 3)).toContainEqual(expect.objectContaining({ type: 'mageStrike', nodeId: 'P', killed: 0 }));
    expect(shielded.nodes.P!.troops).toBe(30);

    const lost = freezeEconomy(createWorld(mageLevel()));
    runFor(lost, ticks(MAGE.everyMs) - 2);
    lost.nodes.P!.owner = 'enemy';
    runFor(lost, 3);
    expect(lost.nodes.P!.troops).toBe(30);
  });

  it('stops once the tower is no longer the enemy’s', () => {
    const world = freezeEconomy(createWorld(mageLevel()));
    world.nodes.T!.owner = 'neutral';
    const events = runFor(world, ticks(MAGE.everyMs) * 2);
    expect(events.some((e) => e.type === 'mageWarning' || e.type === 'mageStrike')).toBe(false);
  });

  it('the AI moves troops out of the marked node', () => {
    const world = createWorld(mageLevel());
    runFor(world, ticks(MAGE.everyMs - MAGE.warnMs));
    const ai = createAi('player', { thinkMs: 1000, aggression: 0.5 });
    ai.nextThinkTick = world.tick;
    expect(aiStep(world, ai)).toContainEqual(expect.objectContaining({ type: 'send', from: 'P', to: 'Q' }));
  });

  it('chapter 1 level 10: the mage in his tower, goal capital; AI vs AI ends and the mage strikes', () => {
    const l10 = getLevel('c01_l10')!;
    expect(l10.special?.type).toBe('mage');
    expect(l10.goal).toEqual({ type: 'capital' });
    expect(l10.enemy.leader).toBeUndefined();
    for (const seed of [1, 2, 3]) {
      const world = createWorld(l10, { seed });
      expect(world.boss?.type === 'mage' && world.boss.towerId).toBe(world.capitals.enemy);
      const p = createAi('player', { thinkMs: 1200, aggression: 0.6 });
      const e = createAi('enemy', aiParamsFromLevel(l10.enemy, world.goal, world.capitals.player));
      let strikes = 0;
      while (!world.winner && world.tick < ticks(15 * 60 * 1000)) {
        strikes += step(world, [...aiStep(world, p), ...aiStep(world, e)]).filter((ev) => ev.type === 'mageStrike').length;
      }
      expect(world.winner).not.toBeNull();
      expect(strikes).toBeGreaterThan(0);
    }
  });

  it('the first win on level 10 gives the fireball, once', () => {
    const progress = defaultProgress();
    expect(grantWinSpells(progress, 'c01_l10')).toEqual(['fireball']);
    expect(grantWinSpells(progress, 'c01_l10')).toEqual([]);
  });
});
