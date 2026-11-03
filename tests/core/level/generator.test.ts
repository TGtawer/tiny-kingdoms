import { describe, expect, it } from 'vitest';
import { generateLevel, type GeneratorParams } from '../../../src/core/level/generator';
import { validateLevel } from '../../../src/core/level/schema';

const params = (seed: number, nodeCount: number): GeneratorParams => ({
  seed,
  id: `gen_${seed}_${nodeCount}`,
  chapter: 1,
  index: 1,
  nodeCount,
  enemy: { productionMult: 0.7, aiThinkMs: 2000, aggression: 0.3, startGold: 20 },
  playerStartGold: 20,
  baseTroops: 20,
  neutralTroops: [4, 9],
  goldVeinPairs: 1,
});

describe('generateLevel', () => {
  it.each([6, 7, 8, 9, 12, 16, 20])('produces valid levels with %i nodes for many seeds', (count) => {
    for (let seed = 1; seed <= 15; seed++) {
      const level = generateLevel(params(seed, count));
      const result = validateLevel(level);
      expect(result.ok, result.ok ? '' : result.errors.join('\n')).toBe(true);
      expect(level.nodes).toHaveLength(count);
    }
  });

  it('is deterministic', () => {
    expect(generateLevel(params(42, 9))).toEqual(generateLevel(params(42, 9)));
    expect(generateLevel(params(42, 9))).not.toEqual(generateLevel(params(43, 9)));
  });

  it('is point-symmetric: every node has a mirror with the same size and garrison', () => {
    const level = generateLevel(params(5, 9));
    for (const n of level.nodes) {
      const m = level.nodes.find((o) => Math.abs(o.x - (1 - n.x)) < 0.002 && Math.abs(o.y - (1 - n.y)) < 0.002);
      expect(m, n.id).toBeDefined();
      expect(m!.size).toBe(n.size);
      expect(m!.hasGoldVein).toBe(n.hasGoldVein);
      if (n.owner === 'neutral') expect(m!.troops).toBe(n.troops);
    }
    expect(level.nodes.filter((n) => n.owner === 'player')).toHaveLength(1);
    expect(level.nodes.filter((n) => n.owner === 'enemy')).toHaveLength(1);
  });

  it('rejects impossible node counts', () => {
    expect(() => generateLevel(params(1, 2))).toThrow();
    expect(() => generateLevel(params(1, 21))).toThrow();
  });
});
