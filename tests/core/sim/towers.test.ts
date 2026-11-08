import { describe, expect, it } from 'vitest';
import { BUILDINGS, TICK_MS } from '../../../src/config/balance';
import { arriveUnit } from '../../../src/core/sim/combat';
import { step } from '../../../src/core/sim/tick';
import { fireTowers, type TowerShot } from '../../../src/core/sim/towers';
import { createWorld, type Owner, type World } from '../../../src/core/sim/World';
import { eventsOf, freezeEconomy, level, lineWorld, node, placeUnit } from '../helpers';

const ZONE = BUILDINGS.tower.zone;
const TICKS_PER_SEC = 1000 / TICK_MS;

/** Line P — N — E (roads 0.4 long) with a tower of `level` on `at`, owned as the line has it. */
function towerWorld(at: 'P' | 'N' | 'E', lvl: 1 | 2 | 3 = 1): World {
  return freezeEconomy(lineWorld({ [at]: { troops: 10, building: { type: 'tower', level: lvl } } }));
}

/** Progress on a road of `length` that puts a unit `dist` from the center of the node it walks to. */
function at(dist: number, length = 0.4): number {
  return 1 - dist / length;
}

/** The tower shots of this moment (no movement, no other rules). */
function fire(world: World): TowerShot[] {
  const out: TowerShot[] = [];
  fireTowers(world, out);
  return out;
}

describe('tower zone (docs/TOWER.md)', () => {
  it('shoots a hostile unit inside the zone, not one beyond its border', () => {
    const world = towerWorld('N');
    const outside = placeUnit(world, 'player', ['P', 'N'], at(ZONE + 0.01));
    expect(fire(world)).toEqual([]);
    expect(outside.slot).toBeGreaterThanOrEqual(0);

    const inside = placeUnit(world, 'player', ['P', 'N'], at(ZONE - 0.01));
    const shots = fire(world);
    expect(shots).toEqual([{ nodeId: 'N', unitId: inside.id, owner: 'player', lane: world.laneIndex['P>N'], progress: inside.progress }]);
    expect(inside.slot).toBe(-1);
    expect(world.units).toEqual([outside]);
    expect(world.lanes[world.laneIndex['P>N']!]!.units).toEqual([outside]);
    expect(world.incoming.N!.player).toBe(1);
  });

  it('the zone border itself is inside', () => {
    const world = towerWorld('N');
    placeUnit(world, 'player', ['P', 'N'], at(ZONE));
    expect(fire(world)).toHaveLength(1);
  });

  it('shoots the hostile unit nearest to the node first, across all its roads', () => {
    const world = towerWorld('N');
    const far = placeUnit(world, 'player', ['P', 'N'], at(0.1));
    const near = placeUnit(world, 'enemy', ['E', 'N'], at(0.06));
    // N is neutral: both sides are hostile to its tower.
    expect(fire(world).map((s) => s.unitId)).toEqual([near.id]);
    world.tick = TICKS_PER_SEC;
    expect(fire(world).map((s) => s.unitId)).toEqual([far.id]);
  });

  it('in a column the head (the nearest) dies first', () => {
    const world = towerWorld('N');
    const tail = placeUnit(world, 'player', ['P', 'N'], at(0.11));
    const head = placeUnit(world, 'player', ['P', 'N'], at(0.05));
    expect(fire(world).map((s) => s.unitId)).toEqual([head.id]);
    expect(tail.slot).toBeGreaterThanOrEqual(0);
  });

  it('skips own units and finds the hostile one behind them', () => {
    const world = towerWorld('P');
    // P is the player's: its tower shoots the enemy and lets its own units by.
    placeUnit(world, 'player', ['N', 'P'], at(0.04));
    const enemy = placeUnit(world, 'enemy', ['N', 'P'], at(0.1));
    expect(fire(world).map((s) => s.unitId)).toEqual([enemy.id]);
    expect(world.units.map((u) => u.owner)).toEqual(['player']);
  });

  it('a neutral tower shoots every side but neutrals', () => {
    const world = towerWorld('N');
    placeUnit(world, 'neutral', ['P', 'N'], at(0.05));
    expect(fire(world)).toEqual([]);
  });

  it('does not shoot units on roads that do not lead to its node', () => {
    const world = towerWorld('N');
    // Leaving N towards P, close to N: on the road N > P, not one into N.
    placeUnit(world, 'player', ['N', 'P'], 0.2);
    placeUnit(world, 'enemy', ['N', 'E'], 0.2);
    expect(fire(world)).toEqual([]);
  });

  it('does not cover a portal link (units in it are not seen)', () => {
    const world = createWorld(
      level(
        [
          node('P', 0.1, 0.5, { owner: 'player', troops: 20 }),
          node('A', 0.25, 0.5, { owner: 'player', kind: 'portal', portalPair: 'x' }),
          node('B', 0.75, 0.5, { owner: 'enemy', kind: 'portal', portalPair: 'x', troops: 5, building: { type: 'tower', level: 3 } }),
          node('E', 0.9, 0.5, { owner: 'enemy', troops: 10 }),
        ],
        [
          ['P', 'A'],
          ['B', 'E'],
        ],
      ),
    );
    const inPortal = placeUnit(world, 'player', ['A', 'B'], 0.99);
    expect(world.lanes[world.laneIndex['A>B']!]!.portal).toBe(true);
    expect(fire(world)).toEqual([]);
    expect(inPortal.slot).toBeGreaterThanOrEqual(0);
    // The real road into B is covered.
    placeUnit(world, 'player', ['E', 'B'], 0.9);
    expect(fire(world)).toHaveLength(1);
  });

  it('on a short road the zone passes its middle', () => {
    const world = freezeEconomy(
      createWorld(
        level(
          [
            node('P', 0.4, 0.5, { owner: 'player', troops: 10 }),
            node('T', 0.6, 0.5, { owner: 'enemy', troops: 10, building: { type: 'tower', level: 1 } }),
          ],
          [['P', 'T']],
        ),
      ),
    );
    // The road is 0.2: a unit just past P's side of the middle is still in the zone (0.13 > 0.1).
    const unit = placeUnit(world, 'player', ['P', 'T'], 0.4);
    expect((1 - unit.progress) * 0.2).toBeGreaterThan(0.1);
    expect(fire(world).map((s) => s.unitId)).toEqual([unit.id]);
  });

  it('shoots under a shield on its node', () => {
    const world = towerWorld('N');
    world.nodes.N!.shieldTicks = 50;
    placeUnit(world, 'player', ['P', 'N'], at(0.05));
    expect(fire(world)).toHaveLength(1);
  });
});

describe('tower rate (docs/TOWER.md)', () => {
  it('one shot in reserve: the first unit to enter the zone dies at once, the next one waits for the reload', () => {
    const world = towerWorld('N');
    world.tick = 500;
    placeUnit(world, 'player', ['P', 'N'], at(0.05));
    placeUnit(world, 'player', ['P', 'N'], at(0.1));
    expect(fire(world)).toHaveLength(1);
    world.tick += TICKS_PER_SEC - 1;
    expect(fire(world)).toHaveLength(0);
    world.tick += 1;
    expect(fire(world)).toHaveLength(1);
  });

  it.each([1, 2, 3] as const)('level %i: shotsPerSec shots per second while the zone is never empty', (lvl) => {
    const rate = BUILDINGS.tower.shotsPerSec[lvl - 1]!;
    const world = towerWorld('N', lvl);
    let shots = 0;
    for (let t = 0; t < 4 * TICKS_PER_SEC; t++) {
      world.tick = t;
      if (world.units.length === 0) placeUnit(world, 'player', ['P', 'N'], at(0.05));
      shots += fire(world).length;
    }
    expect(shots).toBeGreaterThanOrEqual(rate * 4);
    expect(shots).toBeLessThanOrEqual(rate * 4 + 1);
  });

  it('at most one shot per tower per tick, even with targets on several roads', () => {
    const world = towerWorld('N', 3);
    placeUnit(world, 'player', ['P', 'N'], at(0.05));
    placeUnit(world, 'enemy', ['E', 'N'], at(0.05));
    expect(fire(world)).toHaveLength(1);
  });
});

describe('tower and the node (docs/TOWER.md)', () => {
  it('a shot is not an attack on the node: no attackedUntilMs', () => {
    const world = towerWorld('E');
    placeUnit(world, 'player', ['N', 'E'], at(0.05));
    const events = step(world);
    expect(eventsOf(events, 'towerShot')).toHaveLength(1);
    expect(world.nodes.E!.attackedUntilMs).toBe(0);
  });

  it('a unit that reaches the node trades 1:1 even with a shot ready (no shot at the node)', () => {
    const world = towerWorld('E');
    expect(arriveUnit(world, 0, 'player', world.nodes.E!).outcome).toBe('repelled');
    expect(world.nodes.E!.troops).toBe(9);
  });

  it('a stream into a tower loses units on the road, the rest fight at the node', () => {
    const world = towerWorld('N', 3);
    world.nodes.P!.troops = 40;
    world.nodes.N!.troops = 3;
    const events: ReturnType<typeof step> = [...step(world, [{ type: 'send', side: 'player', from: 'P', to: 'N' }])];
    for (let i = 0; i < 300 && world.nodes.N!.owner !== 'player'; i++) events.push(...step(world));
    const shots = eventsOf(events, 'towerShot');
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) expect((1 - shot.progress) * 0.4).toBeLessThanOrEqual(ZONE + 1e-9);
    const outcomes = eventsOf(events, 'arrived').map((a) => a.outcome);
    expect(outcomes.slice(0, 3)).toEqual(['repelled', 'repelled', 'repelled']);
    expect(outcomes[3]).toBe('captured');
    expect(world.nodes.N!.owner).toBe('player');
  });

  it('a captured tower keeps its level and reload and shoots at its former owner', () => {
    const world = towerWorld('E', 2);
    const node = world.nodes.E!;
    placeUnit(world, 'player', ['N', 'E'], at(0.05));
    expect(fire(world)).toHaveLength(1);
    const readyAt = node.towerReadyAtMs;
    node.troops = 0;
    expect(arriveUnit(world, 0, 'player', node).outcome).toBe('captured');
    expect(node.building).toEqual({ type: 'tower', level: 2 });
    expect(node.towerReadyAtMs).toBe(readyAt);
    // The enemy comes back along the same road: the tower now shoots enemy units, not the player's.
    world.tick = readyAt / TICK_MS;
    placeUnit(world, 'player', ['N', 'E'], at(0.03));
    const enemy = placeUnit(world, 'enemy', ['N', 'E'], at(0.08));
    expect(fire(world).map((s) => [s.unitId, s.owner as Owner])).toEqual([[enemy.id, 'enemy']]);
  });
});
