import { CRYSTALS } from '../../config/balance';
import type { LevelData } from '../level/schema';
import { isCompleted, markCompleted, type Progress } from './Progress';

export type BattleOutcome = 'victory' | 'defeat';

export interface Reward {
  crystals: number;
  /** First victory on this level (opens the next one). */
  firstClear: boolean;
}

/** Base reward of a level: 20 + 5 × chapter (BALANCE.md). */
export function baseReward(level: LevelData): number {
  return CRYSTALS.base + CRYSTALS.perChapter * level.chapter;
}

/** First victory: full base; replay victory: 50%; defeat: 25% (consolation). */
export function rewardFor(progress: Progress, level: LevelData, outcome: BattleOutcome): Reward {
  const base = baseReward(level);
  if (outcome === 'defeat') return { crystals: Math.round(base * CRYSTALS.defeatShare), firstClear: false };
  const firstClear = !isCompleted(progress, level.id);
  return { crystals: firstClear ? base : Math.round(base * CRYSTALS.replayShare), firstClear };
}

/** Applies the battle result to progress and returns the reward given. */
export function applyBattleResult(progress: Progress, level: LevelData, outcome: BattleOutcome): Reward {
  const reward = rewardFor(progress, level, outcome);
  progress.crystals += reward.crystals;
  if (outcome === 'victory') markCompleted(progress, level.id);
  return reward;
}

// TODO(stage-6): "double for a rewarded ad" (×CRYSTALS.rewardedAdMult) on the victory screen.
