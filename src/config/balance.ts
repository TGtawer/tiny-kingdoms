// ALL balance numbers live here (see docs/BALANCE.md). Starting values for the prototype.

export type NodeSize = 'small' | 'medium' | 'large';
export type BuildingType = 'mine' | 'barracks' | 'tower';
export type SpellId = 'fireball' | 'reinforcement';
export const SPELL_IDS: readonly SpellId[] = ['fireball', 'reinforcement'];

/** GDD 3.8: a spell becomes available after completing this chapter. */
export const SPELL_UNLOCK_AFTER_CHAPTER: Record<SpellId, number> = {
  fireball: 1,
  reinforcement: 2,
};

/** Simulation fixed timestep. */
export const TICK_MS = 100;

export const NODES: Record<NodeSize, { capacity: number; troopsPerSec: number; goldPerSec: number }> = {
  small: { capacity: 20, troopsPerSec: 0.5, goldPerSec: 0.3 },
  medium: { capacity: 35, troopsPerSec: 0.8, goldPerSec: 0.4 },
  large: { capacity: 50, troopsPerSec: 1.2, goldPerSec: 0.5 },
};

/** Index 0 = level 1, index 1 = level 2, index 2 = level 3. */
type PerLevel<T> = readonly [T, T, T];

export const BUILDINGS = {
  /** Cost to build (level 1) and to upgrade to level 2 and 3. */
  cost: [30, 60, 120] as PerLevel<number>,
  mine: {
    extraGoldPerSec: [1.0, 2.0, 3.5] as PerLevel<number>,
  },
  barracks: {
    productionMult: [1.5, 2.0, 2.6] as PerLevel<number>,
    extraCapacity: [15, 30, 50] as PerLevel<number>,
  },
  tower: {
    /** Damage dealt once to each arriving enemy army, before combat. */
    damage: [4, 8, 14] as PerLevel<number>,
  },
  maxLevel: 3,
  /** Levels lost by a building when its node is captured; level 1 is destroyed. */
  captureLevelLoss: 1,
} as const;

export const ARMY = {
  /** Field widths per second. */
  speed: 0.12,
  /** Share of node troops sent per order (rounded down): swipe sends more than tap-tap (GDD 3.5). */
  sendShare: { swipe: 0.75, tap: 0.5 },
  minSend: 1,
  /** A node with this many troops or fewer cannot send. */
  minTroopsToSend: 2,
} as const;

/** Battle speed-up button (GDD 3.11): offered while the player owns more than `unlockShare` of all nodes. */
export const SPEED_UP = {
  unlockShare: 0.65,
  /** Simulation ticks per real tick while sped up. */
  multiplier: 2,
} as const;

export const SPELLS: Record<SpellId, { cost: number; cooldownSec: number }> & {
  fireball: { killShare: number; minKill: number };
  reinforcement: { troops: number };
} = {
  fireball: { cost: 40, cooldownSec: 20, killShare: 0.4, minKill: 5 },
  reinforcement: { cost: 30, cooldownSec: 25, troops: 10 },
};

export const START_GOLD = {
  player: 20,
  // Enemy start gold is defined per level.
} as const;

/**
 * Enemy AI tuning. Difficulty per level comes from LevelData.enemy (productionMult, aiThinkMs, aggression 0..1).
 * Not in BALANCE.md yet: starting guesses, to be tuned in playtests.
 */
export const AI = {
  /** Random spread of the think interval, ±share. */
  thinkJitter: 0.2,
  /** Required troops = defense × (1 + margin) + flatMargin; margin goes from max (aggression 0) to min (aggression 1). */
  attackMarginMax: 0.6,
  attackMarginMin: 0.1,
  flatMargin: 2,
  /** Attacks launched per decision: 1 at aggression 0, up to this at aggression 1. */
  maxAttacksPerThink: 2,
  /** Weight of a target node by size. */
  sizeValue: { small: 1, medium: 1.5, large: 2 },
  goldVeinValue: 0.6,
  buildingLevelValue: 0.4,
  /** Opponent nodes are worth (1 + aggression × this) times more than neutrals. */
  opponentTargetBonus: 1,
  /** Each field unit of travel counts as this many troops of cost when scoring targets. */
  distanceCost: 12,
  /** Hostile armies arriving within this time count as a threat. */
  defendLookaheadSec: 8,
  /** Rear nodes push troops to the front once they reach this share of capacity. */
  consolidateAt: 0.85,
  /** Below this aggression the AI prefers towers on the front line, above it barracks. */
  towerAggressionThreshold: 0.5,
} as const;

/** Star rating of a won level (GDD 4.2). */
export const STARS = {
  max: 3,
  /** Win faster than this for the "fast" star, unless the level sets starTimeSec. Simulation seconds. */
  defaultTimeSec: 180,
} as const;

export const CRYSTALS = {
  /** Victory reward: base + perChapter * chapter. */
  base: 20,
  perChapter: 5,
  replayShare: 0.5,
  defeatShare: 0.25,
  rewardedAdMult: 2,
} as const;

export const BONUSES = {
  maxLevel: 10,
  /** Cost of level n: round(costBase * costGrowth^(n-1)). */
  costBase: 50,
  costGrowth: 1.35,
  perLevel: {
    startArmy: 2,
    troopProduction: 0.04,
    goldIncome: 0.05,
    unitStrength: 0.03,
  },
} as const;

export const SPELL_UPGRADES = {
  maxLevel: 5,
  /** Cost of level n: round(costBase * costGrowth^(n-1)). */
  costBase: 80,
  costGrowth: 1.4,
  perLevel: {
    fireball: { damageShare: 0.05, cooldownSec: -1 },
    reinforcement: { troops: 3, cooldownSec: -1 },
  },
} as const;
