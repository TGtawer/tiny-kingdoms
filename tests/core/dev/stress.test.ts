import { describe, expect, it } from 'vitest';
import { createStress, stressStep } from '../../../src/core/dev/stress';
import { validateLevel } from '../../../src/core/level/schema';
import { step } from '../../../src/core/sim/tick';
import { createWorld } from '../../../src/core/sim/World';
import { getLevel, STRESS_LEVEL } from '../../../src/levels';

describe('stress driver (ARCHITECTURE.md «Производительность»)', () => {
  it('dev_stress is a valid 20-node level of large nodes with level 3 barracks, reachable by id', () => {
    expect(validateLevel(STRESS_LEVEL).ok).toBe(true);
    expect(getLevel('dev_stress')).toBe(STRESS_LEVEL);
    expect(STRESS_LEVEL.nodes).toHaveLength(20);
    expect(STRESS_LEVEL.nodes.every((n) => n.size === 'large' && n.building?.level === 3)).toBe(true);
  });

  it('keeps the field at the target number of units and every node streaming', () => {
    const world = createWorld(STRESS_LEVEL, { seed: 1 });
    const stress = createStress();
    for (let t = 0; t < 300; t++) {
      const commands = stressStep(world, stress, 600);
      expect(world.units.length).toBeGreaterThanOrEqual(600);
      step(world, commands);
    }
    expect(world.winner).toBeNull();
    expect(world.streams.length).toBeGreaterThan(10);
  });
});
