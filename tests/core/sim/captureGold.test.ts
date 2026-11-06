import { describe, expect, it } from 'vitest';
import { ECONOMY, SPECIAL_NODES } from '../../../src/config/balance';
import { arriveUnit } from '../../../src/core/sim/combat';
import type { Owner, World } from '../../../src/core/sim/World';
import { lineWorld } from '../helpers';

/** `n` units of `owner` arriving at node `id` now; returns the last result. */
function arriveMany(world: World, id: string, n: number, owner: Owner = 'player') {
  let last = arriveUnit(world, 0, owner, world.nodes[id]!);
  for (let i = 1; i < n; i++) last = arriveUnit(world, 0, owner, world.nodes[id]!);
  return last;
}

describe('gold for capturing a neutral node (PLAYTEST-1 F-4)', () => {
  it('any side gets ECONOMY.neutralCaptureGold at once for a neutral node', () => {
    for (const side of ['player', 'enemy'] as const) {
      const world = lineWorld({ N: { troops: 1 } });
      const gold = world.sides[side].gold;
      const result = arriveMany(world, 'N', 2, side);
      expect(result.outcome).toBe('captured');
      expect(result.captureGold).toBe(ECONOMY.neutralCaptureGold);
      expect(world.sides[side].gold).toBe(gold + ECONOMY.neutralCaptureGold);
    }
  });

  it('a node taken from another side gives nothing, so a ping-pong is not farmed', () => {
    const world = lineWorld({ N: { troops: 0 } });
    arriveMany(world, 'N', 1, 'player');
    const player = world.sides.player.gold;
    const enemy = world.sides.enemy.gold;
    for (let i = 0; i < 5; i++) {
      expect(arriveMany(world, 'N', 2, 'enemy').captureGold).toBe(0);
      expect(arriveMany(world, 'N', 2, 'player').captureGold).toBe(0);
    }
    expect(world.sides.player.gold).toBe(player);
    expect(world.sides.enemy.gold).toBe(enemy);
  });

  it('a chest gives its own gold instead, a temple and a bandit camp the neutral gold', () => {
    const chest = lineWorld({ N: { troops: 0, kind: 'chest' } });
    expect(arriveMany(chest, 'N', 1).captureGold).toBe(SPECIAL_NODES.chest.gold);
    for (const kind of ['temple', 'bandits'] as const) {
      const world = lineWorld({ N: { troops: 0, kind } });
      expect(arriveMany(world, 'N', 1).captureGold, kind).toBe(ECONOMY.neutralCaptureGold);
    }
  });

  it('a node the bandits made neutral gives the gold again; the bandits themselves get nothing', () => {
    const world = lineWorld({ N: { owner: 'player', troops: 0 } });
    const raid = arriveMany(world, 'N', 1, 'neutral');
    expect(raid).toMatchObject({ outcome: 'captured', captureGold: 0 });
    expect(world.nodes.N!.owner).toBe('neutral');
    expect(arriveMany(world, 'N', 2).captureGold).toBe(ECONOMY.neutralCaptureGold);
  });
});
