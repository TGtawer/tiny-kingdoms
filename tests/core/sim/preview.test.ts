import { describe, expect, it } from 'vitest';
import { ARMY, BUILDINGS, STREAM } from '../../../src/config/balance';
import { sendAmount } from '../../../src/core/sim/commands';
import { blockingNode } from '../../../src/core/sim/pathfinding';
import { previewAttack, towerKillsEstimate, towerZoneSec } from '../../../src/core/sim/preview';
import { step } from '../../../src/core/sim/tick';
import { createWorld, ownedShare } from '../../../src/core/sim/World';
import { drain, freezeEconomy, level, lineWorld, node } from '../helpers';

describe('previewAttack', () => {
  it('sums swipe amounts and predicts a win against a weaker garrison', () => {
    const world = lineWorld({ P: { troops: 20 }, N: { troops: 5 } });
    expect(previewAttack(world, 'player', ['P'], 'swipe', 'N')).toEqual({ sent: 15, defenders: 5, wins: true });
  });

  it('predicts a loss when the garrison is too strong', () => {
    const world = lineWorld({ P: { troops: 10 }, N: { troops: 12 } });
    expect(previewAttack(world, 'player', ['P'], 'pull', 'N')).toEqual({ sent: 5, defenders: 12, wins: false });
  });

  it('a tie is not a win', () => {
    const world = lineWorld({ P: { troops: 10 }, N: { troops: 5 } });
    expect(previewAttack(world, 'player', ['P'], 'pull', 'N').wins).toBe(false);
  });

  it('counts only sources that have a route', () => {
    // E is behind the neutral N: no route from P.
    const world = lineWorld({ P: { troops: 20 } });
    expect(previewAttack(world, 'player', ['P'], 'swipe', 'E')).toEqual({ sent: 0, defenders: 10, wins: false });
  });

  it('counts tower shots roughly: the shot in reserve plus rate × (release time of the longest stream + walk through the zone)', () => {
    const world = createWorld(
      level(
        [
          node('A', 0.1, 0.2, { owner: 'player', troops: 10 }),
          node('B', 0.1, 0.8, { owner: 'player', troops: 10 }),
          node('T', 0.6, 0.5, { owner: 'neutral', troops: 4, building: { type: 'tower', level: 1 } }),
        ],
        [
          ['A', 'T'],
          ['B', 'T'],
        ],
      ),
    );
    // T is small: units arrive 0.04 from its center, so a unit walks (0.13 - 0.04) / 0.12 = 0.75 s through the zone.
    expect(towerZoneSec(world.nodes.T!)).toBeCloseTo((BUILDINGS.tower.zone - STREAM.edgeDist.small) / ARMY.speed, 9);
    // 14 units, streams of 7 leave in 1.4 s: the tower takes 1 + ⌊1 × (1.4 + 0.75)⌋ = 3; 11 > 4 defenders.
    expect(towerKillsEstimate(world.nodes.T!, 14, 7)).toBe(3);
    expect(previewAttack(world, 'player', ['A', 'B'], 'swipe', 'T')).toEqual({ sent: 14, defenders: 4, wins: true });
    // A single stream of 7: 7 - 3 = 4 is not more than 4 defenders; against 3 it wins.
    expect(previewAttack(world, 'player', ['A'], 'swipe', 'T').wins).toBe(false);
    world.nodes.T!.troops = 3;
    expect(previewAttack(world, 'player', ['A'], 'swipe', 'T').wins).toBe(true);
  });

  it('tower estimate: never more than the units sent; level 3 shoots three times as fast', () => {
    const world = lineWorld({ N: { troops: 0, building: { type: 'tower', level: 3 } } });
    const n = world.nodes.N!;
    expect(towerKillsEstimate(n, 2, 2)).toBe(2);
    // 10 units leave in 2 s, then 0.75 s through the zone: 1 + ⌊3 × 2.75⌋ = 9.
    expect(towerKillsEstimate(n, 10, 10)).toBe(9);
    expect(towerKillsEstimate(lineWorld().nodes.N!, 10, 10)).toBe(0);
  });

  it('1 unit = 1 unit: the capture takes one more unit than the visible garrison', () => {
    const world = lineWorld({ P: { troops: 10 }, N: { troops: 6.9 } });
    expect(previewAttack(world, 'player', ['P'], 'swipe', 'N').wins).toBe(true);
    world.nodes.N!.troops = 7;
    expect(previewAttack(world, 'player', ['P'], 'swipe', 'N').wins).toBe(false);
  });

  it('an own target is a reinforcement', () => {
    const world = lineWorld({ N: { owner: 'player', troops: 3 } });
    expect(previewAttack(world, 'player', ['P'], 'swipe', 'N')).toEqual({ sent: 7, defenders: 0, wins: true });
  });

  it('matches the size of the stream that actually leaves', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 17 } }));
    const preview = previewAttack(world, 'player', ['P'], 'swipe', 'N');
    step(world, [{ type: 'send', side: 'player', from: 'P', to: 'N', mode: 'swipe' }]);
    expect(world.streams[0]!.left + world.units.length).toBe(preview.sent);
    expect(preview.sent).toBe(sendAmount(17, 'swipe'));
  });

  it('matches the real outcome of the attack', () => {
    for (const garrison of [3, 6, 7, 8, 12]) {
      const world = freezeEconomy(lineWorld({ P: { troops: 10 }, N: { troops: garrison } }));
      const preview = previewAttack(world, 'player', ['P'], 'swipe', 'N');
      step(world, [{ type: 'send', side: 'player', from: 'P', to: 'N', mode: 'swipe' }]);
      drain(world);
      expect(world.nodes.N!.owner === 'player', `garrison ${garrison}`).toBe(preview.wins);
    }
  });
});

describe('blockingNode', () => {
  it('finds the foreign node on the way', () => {
    const world = lineWorld();
    expect(blockingNode(world, 'player', 'P', 'E')).toBe('N');
  });

  it('is null when the route is free', () => {
    const world = lineWorld({ N: { owner: 'player' } });
    expect(blockingNode(world, 'player', 'P', 'E')).toBeNull();
  });

  it('is null when there is no road at all', () => {
    const world = createWorld(level([node('A', 0.1, 0.5, { owner: 'player' }), node('B', 0.9, 0.5)], []));
    expect(blockingNode(world, 'player', 'A', 'B')).toBeNull();
  });
});

describe('ownedShare', () => {
  it('counts neutrals in the total', () => {
    const world = lineWorld();
    expect(ownedShare(world, 'player')).toBeCloseTo(1 / 3);
    world.nodes.N!.owner = 'player';
    expect(ownedShare(world, 'player')).toBeCloseTo(2 / 3);
  });
});
