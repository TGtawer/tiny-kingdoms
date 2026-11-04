import { describe, expect, it } from 'vitest';
import { sendAmount } from '../../../src/core/sim/commands';
import { blockingNode } from '../../../src/core/sim/pathfinding';
import { previewAttack } from '../../../src/core/sim/preview';
import { step } from '../../../src/core/sim/tick';
import { createWorld, ownedShare } from '../../../src/core/sim/World';
import { freezeEconomy, level, lineWorld, node, run } from '../helpers';

describe('previewAttack', () => {
  it('sums swipe amounts and predicts a win against a weaker garrison', () => {
    const world = lineWorld({ P: { troops: 20 }, N: { troops: 5 } });
    expect(previewAttack(world, 'player', ['P'], 'swipe', 'N')).toEqual({ sent: 15, defenders: 5, wins: true });
  });

  it('predicts a loss when the garrison is too strong', () => {
    const world = lineWorld({ P: { troops: 10 }, N: { troops: 12 } });
    expect(previewAttack(world, 'player', ['P'], 'tap', 'N')).toEqual({ sent: 5, defenders: 12, wins: false });
  });

  it('a tie is not a win', () => {
    const world = lineWorld({ P: { troops: 10 }, N: { troops: 5 } });
    expect(previewAttack(world, 'player', ['P'], 'tap', 'N').wins).toBe(false);
  });

  it('counts only sources that have a route', () => {
    // E is behind the neutral N: no route from P.
    const world = lineWorld({ P: { troops: 20 } });
    expect(previewAttack(world, 'player', ['P'], 'swipe', 'E')).toEqual({ sent: 0, defenders: 10, wins: false });
  });

  it('applies tower damage to each arriving army', () => {
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
    // Each army of 7 loses 4 to the tower: 3 + 3 = 6 > 4.
    expect(previewAttack(world, 'player', ['A', 'B'], 'swipe', 'T')).toEqual({ sent: 14, defenders: 4, wins: true });
    // A single army: 7 - 4 = 3 < 4.
    expect(previewAttack(world, 'player', ['A'], 'swipe', 'T').wins).toBe(false);
  });

  it('takes unit strength into account', () => {
    const world = lineWorld({ P: { troops: 10 }, N: { troops: 6 } });
    expect(previewAttack(world, 'player', ['P'], 'tap', 'N').wins).toBe(false);
    world.sides.player.modifiers.unitStrengthMult = 1.5;
    expect(previewAttack(world, 'player', ['P'], 'tap', 'N').wins).toBe(true);
  });

  it('an own target is a reinforcement', () => {
    const world = lineWorld({ N: { owner: 'player', troops: 3 } });
    expect(previewAttack(world, 'player', ['P'], 'swipe', 'N')).toEqual({ sent: 7, defenders: 0, wins: true });
  });

  it('matches the size of the army that actually leaves', () => {
    const world = freezeEconomy(lineWorld({ P: { troops: 17 } }));
    const preview = previewAttack(world, 'player', ['P'], 'swipe', 'N');
    step(world, [{ type: 'send', side: 'player', from: 'P', to: 'N', mode: 'swipe' }]);
    expect(world.armies[0]!.count).toBe(preview.sent);
    expect(preview.sent).toBe(sendAmount(17, 'swipe'));
  });

  it('matches the real outcome of the attack', () => {
    for (const garrison of [3, 6, 7, 8, 12]) {
      const world = freezeEconomy(lineWorld({ P: { troops: 10 }, N: { troops: garrison } }));
      const preview = previewAttack(world, 'player', ['P'], 'swipe', 'N');
      run(world, 60, [{ type: 'send', side: 'player', from: 'P', to: 'N', mode: 'swipe' }]);
      expect(world.nodes.N!.owner === 'player').toBe(preview.wins);
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
