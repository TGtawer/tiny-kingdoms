import type { LevelData } from '../core/level/schema';
import test01 from './test/test01.json';

// TODO(stage-4): validate levels with core/level/schema and load chapter levels.

/** Test battlefield (stages 2–3), until chapter 1 levels exist. */
export const TEST_LEVEL = test01 as LevelData;

export const ALL_LEVELS: readonly LevelData[] = [TEST_LEVEL];
