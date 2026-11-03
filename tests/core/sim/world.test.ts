import { describe, expect, it } from 'vitest';
import type { Command } from '../../../src/core/sim/commands';
import { step } from '../../../src/core/sim/tick';
import { createWorld, random } from '../../../src/core/sim/World';
import { level, lineWorld, node } from '../helpers';

describe('createWorld', () => {
  it('copies level data and sets start gold', () => {
    const data = level([node('P', 0, 0, { owner: 'player', troops: 7 }), node('E', 1, 0, { owner: 'enemy' })], [['P', 'E']], {
      playerStartGold: 20,
      enemy: { productionMult: 0.7, aiThinkMs: 1000, aggression: 0.5, startGold: 15 },
    });
    const world = createWorld(data);
    expect(world.sides.player.gold).toBe(20);
    expect(world.sides.enemy.gold).toBe(15);
    expect(world.sides.enemy.modifiers.troopProductionMult).toBe(0.7);
    world.nodes.P!.troops = 99;
    expect(data.nodes[0]!.troops).toBe(7);
  });

  it('start army bonus applies only to player start nodes', () => {
    const world = lineWorld({ P: { troops: 10 } }, {}, { player: { startArmyBonus: 4 } });
    expect(world.nodes.P!.troops).toBe(14);
    expect(world.nodes.N!.troops).toBe(5);
    expect(world.nodes.E!.troops).toBe(10);
  });

  it('is plain serializable data', () => {
    const world = lineWorld();
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
  });
});

describe('determinism', () => {
  it('same commands produce identical worlds', () => {
    const script: Record<number, Command[]> = {
      0: [{ type: 'send', side: 'player', from: 'P', to: 'N' }],
      30: [{ type: 'send', side: 'enemy', from: 'E', to: 'N' }],
      60: [{ type: 'build', side: 'player', nodeId: 'P', building: 'barracks' }],
    };
    const a = lineWorld({}, { playerStartGold: 50 });
    const b = lineWorld({}, { playerStartGold: 50 });
    for (let i = 0; i < 300; i++) {
      step(a, script[i] ?? []);
      step(b, script[i] ?? []);
    }
    expect(a).toEqual(b);
    expect(a.tick).toBe(300);
  });

  it('seeded RNG repeats for the same seed and differs for another', () => {
    const seq = (seed: number) => {
      const world = lineWorld({}, {}, { seed });
      return Array.from({ length: 5 }, () => random(world));
    };
    expect(seq(42)).toEqual(seq(42));
    expect(seq(42)).not.toEqual(seq(43));
    for (const v of seq(7)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
