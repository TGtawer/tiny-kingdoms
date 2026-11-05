import { describe, expect, it } from 'vitest';
import { ARMY, NODES, SPECIAL_NODES, TICK_MS } from '../../../src/config/balance';
import { aiStep, createAi } from '../../../src/core/ai/EnemyAI';
import { validateLevel } from '../../../src/core/level/schema';
import { raidTarget } from '../../../src/core/sim/bandits';
import { arriveUnit } from '../../../src/core/sim/combat';
import { validate } from '../../../src/core/sim/commands';
import { goldRate, sideGoldRate, templeIncomeMult } from '../../../src/core/sim/economy';
import { armyPath, PORTAL_LENGTH, routeLength } from '../../../src/core/sim/pathfinding';
import { previewAttack } from '../../../src/core/sim/preview';
import { step } from '../../../src/core/sim/tick';
import { createWorld, type Owner, type World } from '../../../src/core/sim/World';
import { drain, eventsOf, freezeEconomy, level, lineWorld, node, placeUnit, run } from '../helpers';

/** `n` units of `owner` arriving at `target` now; returns the last result. */
function arriveMany(world: World, target: string, n: number, owner: Owner = 'player') {
  let last = arriveUnit(world, 0, owner, world.nodes[target]!);
  for (let i = 1; i < n; i++) last = arriveUnit(world, 0, owner, world.nodes[target]!);
  return last;
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
  it('each defender withstands two attackers', () => {
    const world = lineWorld({ N: { troops: 5, kind: 'fortress' } });
    expect(arriveMany(world, 'N', 10).outcome).toBe('repelled');
    expect(world.nodes.N!.troops).toBeCloseTo(0, 9);

    const w2 = lineWorld({ N: { troops: 5, kind: 'fortress' } });
    expect(arriveMany(w2, 'N', 11).outcome).toBe('captured');
    expect(w2.nodes.N!.troops).toBe(1);
    expect(w2.nodes.N!.kind).toBe('fortress');
  });

  it('is in the attack preview', () => {
    const world = lineWorld({ P: { troops: 15 }, N: { troops: 5, kind: 'fortress' } });
    // 11 attackers: 10 trades with 5 double defenders, the 11th captures.
    expect(previewAttack(world, 'player', ['P'], 'swipe', 'N')).toMatchObject({ sent: 11, wins: true });
    world.nodes.N!.troops = 5.5;
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
    const result = arriveMany(world, 'N', 3);
    expect(result.chestGold).toBe(SPECIAL_NODES.chest.gold);
    expect(world.sides.player.gold).toBe(gold + SPECIAL_NODES.chest.gold);
    expect(world.nodes.N!).toMatchObject({ kind: 'normal', size: 'small', owner: 'player' });

    // Captured again: no second reward.
    world.nodes.N!.troops = 1;
    const again = arriveMany(world, 'N', 2, 'enemy');
    expect(again.chestGold).toBe(0);
  });

  it('a failed attack gives nothing', () => {
    const world = lineWorld({ N: { troops: 9, kind: 'chest' } });
    const gold = world.sides.player.gold;
    expect(arriveMany(world, 'N', 5).chestGold).toBe(0);
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

  it('each unit crosses the portal in delayMs; the column comes out in the same chain', () => {
    const world = freezeEconomy(createWorld(portalLevel()));
    world.nodes.A!.troops = 20;
    const events = [...step(world, [{ type: 'send', side: 'player', from: 'A', to: 'B', mode: 'swipe' }])];
    const travelTicks = ticksFor(SPECIAL_NODES.portal.delayMs);
    for (let i = 0; i < travelTicks - 1; i++) events.push(...step(world));
    expect(eventsOf(events, 'arrived')).toHaveLength(0);
    events.push(...step(world));
    expect(eventsOf(events, 'arrived')).toHaveLength(1);
    drain(world);
    expect(world.nodes.B!.owner).toBe('player');
  });

  it('units inside a portal do not clash', () => {
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
    // The first unit of each side has come out at the other end.
    expect(new Set(eventsOf(events, 'arrived').map((e) => e.owner))).toEqual(new Set(['enemy', 'player']));
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
    // The raid leaves as a stream, like a swipe.
    expect(world.streams.find((s) => s.owner === 'neutral')?.route.path).toEqual(['C', 'P']);
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
    expect(world.streams).toHaveLength(0);
    expect(world.units).toHaveLength(0);
  });

  it('a raid can capture a node for the neutrals; a captured camp stops raiding', () => {
    const world = freezeEconomy(campWorld({ P: 1 }));
    world.nodes.C!.troops = 20;
    run(world, ticksFor(SPECIAL_NODES.bandits.raidEveryMs) + 40);
    expect(world.nodes.P!.owner).toBe('neutral');

    const w2 = campWorld();
    w2.nodes.C!.troops = 1;
    arriveMany(w2, 'C', 2, 'enemy');
    expect(w2.nodes.C!).toMatchObject({ owner: 'enemy', kind: 'normal', raidTick: null });
  });

  it('the AI defends against a bandit raid', () => {
    const world = createWorld(
      level(
        [
          node('P', 0.3, 0.5, { owner: 'player', troops: 30 }),
          node('C', 0.5, 0.5, { troops: 4, kind: 'bandits' }),
          node('E', 0.8, 0.5, { owner: 'enemy', troops: 2 }),
          // Second enemy node that can help E.
          node('H', 0.9, 0.7, { owner: 'enemy', troops: 20 }),
        ],
        [
          ['P', 'C'],
          ['C', 'E'],
          ['E', 'H'],
        ],
      ),
    );
    // A raid of 8 still far enough for H to come in time.
    for (let i = 0; i < 8; i++) placeUnit(world, 'neutral', ['C', 'E'], 0.1);
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
