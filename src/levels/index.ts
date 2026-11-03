import type { LevelData } from '../core/level/schema';
import test01 from './test/test01.json';

// TODO(stage-4): validate levels with core/level/schema and load chapter levels.

/** Test battlefield for stage 2 (enemy is idle until the AI arrives in stage 3). */
export const TEST_LEVEL = test01 as LevelData;

export const ALL_LEVELS: readonly LevelData[] = [TEST_LEVEL];
