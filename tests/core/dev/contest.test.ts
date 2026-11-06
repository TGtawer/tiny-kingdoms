import { describe, expect, it } from 'vitest';
import { contestStep, createContest } from '../../../src/core/dev/contest';
import { validateLevel } from '../../../src/core/level/schema';
import { step } from '../../../src/core/sim/tick';
import { createWorld } from '../../../src/core/sim/World';
import { CONTEST_LEVEL, getLevel } from '../../../src/levels';

describe('contest driver (PLAYTEST-1 F-2)', () => {
  it('dev_contest is a valid level reachable by id', () => {
    expect(validateLevel(CONTEST_LEVEL).ok).toBe(true);
    expect(getLevel('dev_contest')).toBe(CONTEST_LEVEL);
  });

  it('the middle node changes owner many times, then the field goes quiet after the rounds', () => {
    const world = createWorld(CONTEST_LEVEL, { seed: 1 });
    const contest = createContest(2);
    let flips = 0;
    let owner = world.nodes.mid!.owner;
    for (let t = 0; t < 1500 && !world.winner; t++) {
      step(world, contestStep(world, contest));
      if (world.nodes.mid!.owner !== owner) {
        flips++;
        owner = world.nodes.mid!.owner;
      }
    }
    expect(contest.roundsLeft).toBe(0);
    expect(flips).toBeGreaterThan(10);
    expect(world.units).toHaveLength(0);
    expect(world.streams).toHaveLength(0);
  });
});
