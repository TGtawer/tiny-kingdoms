import { describe, expect, it } from 'vitest';
import { ARMY, NODES, SPECIAL_NODES, TICK_MS } from '../../../src/config/balance';
import { aiStep, createAi } from '../../../src/core/ai/EnemyAI';
import { validateLevel } from '../../../src/core/level/schema';
import { raidTarget } from '../../../src/core/sim/bandits';
import { arrive } from '../../../src/core/sim/combat';
import { validate } from '../../../src/core/sim/commands';
import { goldRate, sideGoldRate, templeIncomeMult } from '../../../src/core/sim/economy';
import { armyPath, PORTAL_LENGTH, routeLength } from '../../../src/core/sim/pathfinding';
import { previewAttack } from '../../../src/core/sim/preview';
import { step } from '../../../src/core/sim/tick';
import { createWorld, type ArmyState, type World } from '../../../src/core/sim/World';
import { freezeEconomy, level, lineWorld, node, run } from '../helpers';

function army(_world: World, count: number, target: string, owner: ArmyState['owner'] = 'player'): ArmyState {
  return { id: 'x', owner, count, path: ['P', target], segment: 0, progress: 1, targetId: target };
}

const ticksFor = (ms: number): number => Math.round(ms / TICK_MS);

describe('temple', () => {
  it('produces nothing itself and boosts the owner income by 50% per temple', () => {
    const world = lineWorld({ N: { owner: 'player', kind: 'temple' } });
    expect(goldRate(world.nodes.N!, world.sides.player.modifiers)).toBe(0);
    expect(templeIncomeMult(world, 'player')).toBe(1 + SPECIAL_NODES.temple.goldBonus);
    expect(sideGoldRate(world, 'player')).toBeCloseTo(NODES.small.goldPerSec * 1.5, 9);

    const before = world.sides.player.gold;
    const troops = world.nodes.N!.troops;
    run(world, 10);
    expect(world.sides.player.gold - before).toBeCloseTo(NODES.small.goldPerSec * 1.5, 6);
    expect(world.nodes.N!.troops).toBe(troops);
  });

  it('two temples double the income', () => {
    const world = lineWorld({ N: { owner: 'player', kind: 'temple' }, E: { owner: 'player', kind: 'temple' } });
    expect(templeIncomeMult(world, 'player')).toBe(2);
  });

  it('cannot hold a building', () => {
    const world = lineWorld({ N: { owner: 'player', kind: 'temple' } });
    world.sides.player.gold = 999;
    expect(validate(world, { type: 'build', side: 'player', nodeId: 'N', building: 'barracks' })).toBe('notBuildable');
  });
});

describe('fortress', () => {
  it('defenders count double, after the tower', () => {
    const world = lineWorld({ N: { troops: 5, kind: 'fortress' } });
    expect(arrive(world, army(world, 10, 'N')).outcome).toBe('repelled');
    expect(world.nodes.N!.troops).toBeCloseTo(0, 9);

    const w2 = lineWorld({ N: { troops: 5, kind: 'fortress' } });
    const result = arrive(w2, army(w2, 11, 'N'));
    expect(result.outcome).toBe('captured');
    expect(w2.nodes.N!.troops).toBeCloseTo(1, 9);
    expect(w2.nodes.N!.kind).toBe('fortress');
  });

  it('stacks with unit strength and is in the attack preview', () => {
    const world = lineWorld({ P: { troops: 30 }, N: { troops: 5, kind: 'fortress' } });
    world.sides.player.modifiers.unitStrengthMult = 0.5;
    // 22 attackers × 0.5 = 11 power vs 5 × 2 = 10.
    expect(previewAttack(world, 'player', ['P'], 'swipe', 'N')).toMatchObject({ sent: 22, wins: true });
    world.nodes.N!.troops = 6;
    expect(previewAttack(world, 'player', ['P'], 'swipe', 'N').wins).toBe(false);
  });

  it('the AI asks for twice the force against a fortress', () => {
    const plain = lineWorld({ E: { troops: 10 }, N: { troops: 4 } });
    const fort = lineWorld({ E: { troops: 10 }, N: { troops: 4, kind: 'fortress' } });
    const attacks = (w: World): number =>
      aiStep(w, createAi('enemy', { thinkMs: 100, aggression: 1 })).filter((c) => c.type === 'send').length;
    plain.tick = fort.tick = 10;
    expect(attacks(plain)).toBe(1);
    expect(attacks(fort)).toBe(0);
  });
});

describe('chest', () => {
  it('gives gold once to the capturer and turns into a normal small node', () => {
    const world = lineWorld({ N: { troops: 2, size: 'large', kind: 'chest' } });
    const gold = world.sides.player.gold;
    const result = arrive(world, army(world, 5, 'N'));
    expect(result.chestGold).toBe(SPECIAL_NODES.chest.gold);
    expect(world.sides.player.gold).toBe(gold + SPECIAL_NODES.chest.gold);
    expect(world.nodes.N!).toMatchObject({ kind: 'normal', size: 'small', owner: 'player' });

    // Captured again: no second reward.
    world.nodes.N!.troops = 1;
    const again = arrive(world, army(world, 5, 'N', 'enemy'));
    expect(again.chestGold).toBe(0);
  });

  it('a failed attack gives nothing', () => {
    const world = lineWorld({ N: { troops: 9, kind: 'chest' } });
    const gold = world.sides.player.gold;
    expect(arrive(world, army(world, 5, 'N')).chestGold).toBe(0);
    expect(world.sides.player.gold).toBe(gold);
    expect(world.nodes.N!.kind).toBe('chest');
  });

  it('the AI goes for a nearby chest first', () => {
    const world = createWorld(
      level(
        [
          node('E', 0.5, 0.5, { owner: 'enemy', troops: 20 }),
          node('C', 0.35, 0.5, { troops: 3, kind: 'chest' }),
          node('M', 0.65, 0.5, { troops: 3, size: 'medium' }),
          node('P', 0.1, 0.9, { owner: 'player', troops: 50 }),
        ],
        [
          ['E', 'C'],
          ['E', 'M'],
          ['C', 'P'],
        ],
      ),
    );
    world.tick = 10;
    const cmds = aiStep(world, createAi('enemy', { thinkMs: 100, aggression: 0 }));
    expect(cmds.find((c) => c.type === 'send')).toMatchObject({ from: 'E', to: 'C' });
  });
});

describe('portal', () => {
  // P — A(portal x) ... B(portal x) — E, no road between A and B.
  const portalLevel = () =>
    level(
      [
        node('P', 0.1, 0.5, { owner: 'player', troops: 20 }),
        node('A', 0.25, 0.5, { owner: 'player', kind: 'portal', portalPair: 'x' }),
        node('B', 0.75, 0.5, { kind: 'portal', portalPair: 'x', troops: 2 }),
        node('E', 0.9, 0.5, { owner: 'enemy', troops: 10 }),
      ],
      [
        ['P', 'A'],
        ['B', 'E'],
      ],
    );

  it('is an edge of portal.delayMs travel for pathfinding', () => {
    const world = createWorld(portalLevel());
    expect(world.portals).toEqual([['A', 'B']]);
    const path = armyPath(world, 'player', 'P', 'B')!;
    expect(path).toEqual(['P', 'A', 'B']);
    expect(routeLength(world, path)).toBeCloseTo(0.15 + PORTAL_LENGTH, 9);
    expect(PORTAL_LENGTH).toBeCloseTo((ARMY.speed * SPECIAL_NODES.portal.delayMs) / 1000, 9);
  });

  it('the entry portal must be own: the enemy cannot go through A', () => {
    const world = createWorld(portalLevel());
    world.nodes.B!.owner = 'enemy';
    expect(armyPath(world, 'enemy', 'B', 'A')).toEqual(['B', 'A']); // A is the target: allowed
    expect(armyPath(world, 'enemy', 'B', 'P')).toBeNull(); // through A: not own
  });

  it('an army crosses the portal in delayMs', () => {
    const world = freezeEconomy(createWorld(portalLevel()));
    world.nodes.A!.troops = 20;
    step(world, [{ type: 'send', side: 'player', from: 'A', to: 'B', mode: 'swipe' }]);
    const travelTicks = ticksFor(SPECIAL_NODES.portal.delayMs);
    run(world, travelTicks - 2);
    expect(world.nodes.B!.owner).toBe('neutral');
    run(world, 3);
    expect(world.nodes.B!.owner).toBe('player');
  });

  it('armies inside a portal do not clash', () => {
    const world = freezeEconomy(createWorld(portalLevel()));
    world.nodes.B!.owner = 'enemy';
    world.nodes.B!.troops = 20;
    world.nodes.A!.troops = 20;
    step(world, [
      { type: 'send', side: 'player', from: 'A', to: 'B', mode: 'swipe' },
      { type: 'send', side: 'enemy', from: 'B', to: 'A', mode: 'swipe' },
    ]);
    const events = [];
    for (let i = 0; i < ticksFor(SPECIAL_NODES.portal.delayMs) + 2; i++) events.push(...step(world));
    expect(events.some((e) => e.type === 'clash')).toBe(false);
    expect(events.filter((e) => e.type === 'arrived')).toHaveLength(2);
  });

  it('validation: pairs of two, no road between them, counted for connectivity', () => {
    expect(validateLevel(portalLevel()).ok).toBe(true);
    const lonely = portalLevel();
    lonely.nodes[2]!.portalPair = 'y';
    expect(validateLevel(lonely).ok).toBe(false);
    const withRoad = portalLevel();
    withRoad.roads.push(['A', 'B']);
    expect(validateLevel(withRoad).ok).toBe(false);
    const noPair = portalLevel();
    delete noPair.nodes[1]!.portalPair;
    expect(validateLevel(noPair).ok).toBe(false);
  });
});

describe('bandit camp', () => {
  // P — C(camp) — E; P is closer.
  const campWorld = (extra: { P?: number; E?: number } = {}) =>
    createWorld(
      level(
        [
          node('P', 0.3, 0.5, { owner: 'player', troops: extra.P ?? 5 }),
          node('C', 0.5, 0.5, { troops: 4, kind: 'bandits' }),
          node('E', 0.8, 0.5, { owner: 'enemy', troops: extra.E ?? 5 }),
        ],
        [
          ['P', 'C'],
          ['C', 'E'],
        ],
      ),
    );

  it('produces troops like a small node up to small capacity', () => {
    const world = campWorld();
    run(world, 10);
    expect(world.nodes.C!.troops).toBeCloseTo(4 + NODES.small.troopsPerSec, 6);
    world.nodes.C!.troops = NODES.small.capacity;
    run(world, 10);
    expect(world.nodes.C!.troops).toBe(NODES.small.capacity);
  });

  it('raids the nearest non-neutral neighbour every raid interval', () => {
    const world = campWorld();
    const raids = [];
    for (let i = 0; i < ticksFor(SPECIAL_NODES.bandits.raidEveryMs) + 1; i++) {
      raids.push(...step(world).filter((e) => e.type === 'raid'));
    }
    expect(raids).toHaveLength(1);
    expect(raids[0]).toMatchObject({ from: 'C', to: 'P' });
    const raid = world.armies.find((a) => a.owner === 'neutral')!;
    expect(raid.targetId).toBe('P');
  });

  it('breaks distance ties by the weaker node, then deterministically', () => {
    const tie = createWorld(
      level(
        [
          node('P', 0.3, 0.5, { owner: 'player', troops: 9 }),
          node('C', 0.5, 0.5, { troops: 4, kind: 'bandits' }),
          node('E', 0.7, 0.5, { owner: 'enemy', troops: 3 }),
        ],
        [
          ['P', 'C'],
          ['C', 'E'],
        ],
      ),
    );
    expect(raidTarget(tie, tie.nodes.C!)!.id).toBe('E');
    tie.nodes.E!.troops = 9;
    const a = raidTarget(structuredClone(tie), tie.nodes.C!)!.id;
    const b = raidTarget(structuredClone(tie), tie.nodes.C!)!.id;
    expect(a).toBe(b);
  });

  it('does not raid without non-neutral neighbours', () => {
    const world = createWorld(
      level(
        [
          node('P', 0.1, 0.5, { owner: 'player' }),
          node('N', 0.3, 0.5),
          node('C', 0.5, 0.5, { troops: 10, kind: 'bandits' }),
          node('E', 0.9, 0.5, { owner: 'enemy' }),
        ],
        [
          ['P', 'N'],
          ['N', 'C'],
          ['C', 'E'],
        ],
      ),
    );
    world.nodes.E!.owner = 'neutral';
    run(world, ticksFor(SPECIAL_NODES.bandits.raidEveryMs) + 1);
    expect(world.armies).toHaveLength(0);
  });

  it('a raid can capture a node for the neutrals; a captured camp stops raiding', () => {
    const world = freezeEconomy(campWorld({ P: 1 }));
    world.nodes.C!.troops = 20;
    run(world, ticksFor(SPECIAL_NODES.bandits.raidEveryMs) + 40);
    expect(world.nodes.P!.owner).toBe('neutral');

    const w2 = campWorld();
    w2.nodes.C!.troops = 1;
    arrive(w2, { id: 'x', owner: 'enemy', count: 5, path: ['E', 'C'], segment: 0, progress: 1, targetId: 'C' });
    expect(w2.nodes.C!).toMatchObject({ owner: 'enemy', kind: 'normal', raidTick: null });
  });

  it('the AI defends against a bandit raid', () => {
    const world = campWorld({ P: 30, E: 2 });
    world.nodes.E!.troops = 2;
    // Second enemy node that can help E.
    world.nodes.H = { ...world.nodes.E!, id: 'H', x: 0.9, y: 0.7, troops: 20 };
    world.roads.push(['E', 'H']);
    world.armies.push({ id: 'r', owner: 'neutral', count: 15, path: ['C', 'E'], segment: 0, progress: 0.1, targetId: 'E' });
    world.tick = 10;
    const cmds = aiStep(world, createAi('enemy', { thinkMs: 100, aggression: 0.5 }));
    expect(cmds).toContainEqual(expect.objectContaining({ type: 'send', from: 'H', to: 'E' }));
  });
});

describe('schema: special nodes', () => {
  const base = () =>
    level(
      [node('p', 0.1, 0.5, { owner: 'player' }), node('n', 0.5, 0.5), node('e', 0.9, 0.5, { owner: 'enemy' })],
      [
        ['p', 'n'],
        ['n', 'e'],
      ],
    );
  it('accepts valid kinds and old levels without kind', () => {
    expect(validateLevel(base()).ok).toBe(true);
    for (const kind of ['temple', 'fortress', 'chest', 'bandits'] as const) {
      const l = base();
      l.nodes[1]!.kind = kind;
      expect(validateLevel(l).ok, kind).toBe(true);
    }
  });

  it('rejects owned chests and camps, temples with buildings and unknown kinds', () => {
    const chest = base();
    chest.nodes[0]!.kind = 'chest';
    expect(validateLevel(chest).ok).toBe(false);
    const temple = base();
    temple.nodes[1]!.kind = 'temple';
    temple.nodes[1]!.building = { type: 'tower', level: 1 };
    expect(validateLevel(temple).ok).toBe(false);
    const bad = base() as unknown as { nodes: Array<Record<string, unknown>> };
    bad.nodes[1]!.kind = 'castle';
    expect(validateLevel(bad).ok).toBe(false);
  });
});
