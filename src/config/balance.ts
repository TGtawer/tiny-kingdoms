// ALL balance numbers live here (see docs/BALANCE.md). Starting values for the prototype.

export type NodeSize = 'small' | 'medium' | 'large';
export type BuildingType = 'mine' | 'barracks' | 'tower';
export type SpellId = 'fireball' | 'reinforcement' | 'shield';
/** Special node kinds (GDD 3.12); 'normal' is the default. */
export type NodeKind = 'normal' | 'temple' | 'fortress' | 'chest' | 'portal' | 'bandits';
export const NODE_KINDS: readonly NodeKind[] = ['normal', 'temple', 'fortress', 'chest', 'portal', 'bandits'];
export const SPELL_IDS: readonly SpellId[] = ['fireball', 'reinforcement', 'shield'];

/**
 * GDD 3.8, TUTORIAL.md T-3: spells are given by the story in a fixed order, not chosen.
 * `tour`: claimed in the Upgrades tour after the first win on that level; `afterWin`: the first win on that level.
 * TODO(design): chapter 2 does not exist yet, so the shield is not reachable.
 */
export const SPELL_UNLOCKS: Record<SpellId, { tour: string } | { afterWin: string }> = {
  reinforcement: { tour: 'c01_l06' },
  fireball: { afterWin: 'c01_l10' },
  shield: { afterWin: 'c02_l10' },
};

/**
 * TUTORIAL.md T-3: when buildings and screens open. Buildings: from that level on (in play order);
 * Upgrades: after the first win on that level. The enemy always has every building.
 */
export const FEATURE_UNLOCKS = {
  barracks: 'c01_l03',
  tower: 'c01_l05',
  mine: 'c02_l01',
  upgrades: { afterWin: 'c01_l06' },
} as const;

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
  /**
   * Share of node troops sent per order (rounded down, GDD 3.5): the player only swipes (75%);
   * `pull` (50%) is the AI's internal mode for moving troops up from the rear.
   */
  sendShare: { swipe: 0.75, pull: 0.5 },
  minSend: 1,
  /** A node with this many troops or fewer cannot send. */
  minTroopsToSend: 2,
} as const;

/** Enemy leaders (GDD 3.10, CONTENT.md C-2). */
export type LeaderId = 'king' | 'baron' | 'dwarf' | 'witch';
export const LEADER_IDS: readonly LeaderId[] = ['king', 'baron', 'dwarf', 'witch'];

/**
 * How the AI spends gold:
 * normal — mines, towers on threatened nodes, barracks, upgrades;
 * defensive — mines, then towers on every front-line node, towers upgraded first;
 * economy — mines and barracks everywhere, towers only on threatened nodes, mines upgraded first;
 * rare — builds only with a big gold reserve, barracks only.
 */
export type BuildStyle = 'normal' | 'defensive' | 'economy' | 'rare';

export interface LeaderPreset {
  /** Used when the level does not set them. */
  aggression: number;
  thinkMs: number;
  build: BuildStyle;
  /** Gold kept in reserve before building ('rare' style). */
  buildReserve: number;
  /** Added to the attack margin against opponent nodes (big advantage needed). */
  opponentMarginExtra: number;
  /** After being attacked, the extra margin is dropped for this long (counter-attacks), ms. */
  retaliateMs: number;
  /** No attacks before this battle time (defense still works), ms. */
  attackAfterMs: number;
  /** Target value multiplier bonus for opponent nodes that recently lost troops. */
  weakenedBonus: number;
}

/** Starting presets; level fields (aggression, aiThinkMs) override them. */
export const LEADERS: Record<LeaderId, LeaderPreset> = {
  // Defender: towers on the border, attacks only in response or with a big advantage.
  king: { aggression: 0.35, thinkMs: 1800, build: 'defensive', buildReserve: 0, opponentMarginExtra: 0.8, retaliateMs: 20000, attackAfterMs: 0, weakenedBonus: 0 },
  // Aggressor: attacks early and often, hardly builds.
  baron: { aggression: 0.9, thinkMs: 1100, build: 'rare', buildReserve: 90, opponentMarginExtra: -0.05, retaliateMs: 0, attackAfterMs: 0, weakenedBonus: 0 },
  // Builder: mines and barracks first, attacks late with a big army.
  dwarf: { aggression: 0.6, thinkMs: 1600, build: 'economy', buildReserve: 0, opponentMarginExtra: 0.3, retaliateMs: 0, attackAfterMs: 50000, weakenedBonus: 0 },
  // Opportunist: hits player nodes that just sent their troops away.
  witch: { aggression: 0.65, thinkMs: 1200, build: 'normal', buildReserve: 0, opponentMarginExtra: 0, retaliateMs: 0, attackAfterMs: 0, weakenedBonus: 3 },
};

/** Special nodes (GDD 3.12, CONTENT.md C-1). Starting values, tuned in playtests. */
export const SPECIAL_NODES = {
  /** Owner's whole gold income +50% per temple (two temples: +100%). Temples produce nothing themselves. */
  temple: { goldBonus: 0.5 },
  /** Each defender counts this many times (after the tower hits, together with unit strength). */
  fortress: { defenseMult: 2 },
  /** Gold given once to whoever captures the chest; then it is a normal small node. */
  chest: { gold: 60 },
  /** Travel time through a portal pair, ms (no clashes inside). */
  portal: { delayMs: 1000 },
  /** Bandit camp: produces like a small node and raids the nearest non-neutral neighbour. */
  bandits: { raidEveryMs: 20000 },
} as const;

/** Boss of chapter 1 level 10 (GDD 4.1, CONTENT.md C-4.1). */
export const DRAGON = {
  everyMs: 20000,
  /** Share of the target's troops burned. */
  burnShare: 0.5,
  /** The target is shown this long before the strike. */
  warnMs: 3000,
} as const;

/**
 * Evil mage, boss of chapter 1 level 10 (TUTORIAL.md T-7): a fireball every `everyMs` at the player's biggest
 * garrison, shown `warnMs` before. Damage is the level 1 Fireball spell's.
 */
export const MAGE = {
  everyMs: 20000,
  warnMs: 3000,
  damageShare: 0.4,
  damageMin: 5,
} as const;

/** Boss of chapter 2 level 10 (CONTENT.md C-4.2). */
export const CITADEL = {
  waveEveryMs: 15000,
  /** Extra troops per wave, on top of the garrison. */
  waveSize: 20,
} as const;

/** Battle speed-up button (GDD 3.11): offered while the player owns more than `unlockShare` of all nodes. */
export const SPEED_UP = {
  unlockShare: 0.65,
  /** Simulation ticks per real tick while sped up. */
  multiplier: 2,
} as const;

/** Tutorial (TUTORIAL.md T-4, BALANCE.md «Обучение»). */
export const TUTORIAL = {
  /** Battle speed while a step waits for the player: 80% slower (corridor 0.15–0.25). */
  slowMo: 0.2,
  /** Info-only steps (`until: time`) last at most this long. */
  infoStepMaxSec: 4,
} as const;

export const SPELLS: Record<SpellId, { cost: number; cooldownSec: number }> & {
  fireball: { killShare: number; minKill: number };
  reinforcement: { troops: number };
  shield: { durationSec: number };
} = {
  fireball: { cost: 40, cooldownSec: 20, killShare: 0.4, minKill: 5 },
  reinforcement: { cost: 30, cooldownSec: 25, troops: 10 },
  /** Own node can't be attacked for durationSec: hostile armies that arrive are destroyed. */
  shield: { cost: 30, cooldownSec: 30, durationSec: 8 },
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
  /** "Recently weakened" (witch): look back this many seconds, troops sampled once a second. */
  weakenedWindowSec: 6,
  /** A node counts as weakened after losing this share of its recent maximum (and at least weakenedMinDrop troops). */
  weakenedShare: 0.4,
  weakenedMinDrop: 4,
  /** Extra target value of goal nodes: the node to hold (deny it) and the player's capital. */
  goalTargetValue: 3,
  /** Extra target value of special nodes. */
  templeValue: 1.5,
  chestValue: 2.5,
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
  /** Stars spent on level n = starCosts[n - 1] (GDD 4.3). */
  starCosts: [2, 3, 4, 5, 6],
  perLevel: {
    fireball: { damageShare: 0.05, cooldownSec: -1 },
    reinforcement: { troops: 3, cooldownSec: -1 },
    shield: { durationSec: 1, cooldownSec: -1 },
  },
} as const;
