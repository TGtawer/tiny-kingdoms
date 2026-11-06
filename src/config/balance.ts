// ALL balance numbers live here (see docs/BALANCE.md). Starting values for the prototype.

export type NodeSize = 'small' | 'medium' | 'large';
export type BuildingType = 'mine' | 'barracks' | 'tower';
export const BUILDING_TYPES: readonly BuildingType[] = ['barracks', 'tower', 'mine'];
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
 * When buildings and screens open (PLAYTEST-1 F-5, TUTORIAL.md T-3). A building opens everywhere once the player
 * has built it on its lesson (`learnOn`); until then it is available only there. Upgrades: after the first win on
 * that level. The enemy always has every building.
 */
export const FEATURE_UNLOCKS = {
  barracks: { learnOn: 'c01_l03' },
  tower: { learnOn: 'c01_l05' },
  mine: { learnOn: 'c02_l01' },
  upgrades: { afterWin: 'c01_l06' },
} as const;

/** Simulation fixed timestep. */
export const TICK_MS = 100;

export const NODES: Record<NodeSize, { capacity: number; troopsPerSec: number; goldPerSec: number }> = {
  // Troop numbers halved for stream armies (BALANCE.md, stage 9); gold unchanged.
  // Gold ×1.5 after the playtest (PLAYTEST-1 F-4; was 0.3 / 0.4 / 0.5).
  small: { capacity: 10, troopsPerSec: 0.25, goldPerSec: 0.45 },
  medium: { capacity: 18, troopsPerSec: 0.4, goldPerSec: 0.6 },
  large: { capacity: 25, troopsPerSec: 0.6, goldPerSec: 0.75 },
};

/** Index 0 = level 1, index 1 = level 2, index 2 = level 3. */
type PerLevel<T> = readonly [T, T, T];

export const ECONOMY = {
  /**
   * Gold for capturing a neutral node, given at once to any side (PLAYTEST-1 F-4). Nodes taken from another side
   * give nothing, so a ping-pong over a node can't be farmed; a chest gives its own gold instead of this.
   */
  neutralCaptureGold: 10,
} as const;

export const BUILDINGS = {
  /** Cost to build (level 1) and to upgrade to level 2 and 3. */
  cost: [30, 60, 120] as PerLevel<number>,
  mine: {
    extraGoldPerSec: [1.0, 2.0, 3.5] as PerLevel<number>,
  },
  barracks: {
    productionMult: [1.5, 2.0, 2.6] as PerLevel<number>,
    extraCapacity: [8, 15, 25] as PerLevel<number>,
  },
  tower: {
    /**
     * Shots per second; one shot kills one arriving hostile unit (GDD 3.6). At most one shot is held in reserve,
     * so the first unit always dies and then no more than this many per second.
     */
    shotsPerSec: [1, 2, 3] as PerLevel<number>,
  },
  maxLevel: 3,
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

/** Stream armies (GDD 3.6, BALANCE.md «Армии и поток»): sent troops leave the node one by one. */
export const STREAM = {
  /** Units released per second. Spacing in the column = ARMY.speed / releasePerSec. */
  releasePerSec: 5,
  /** Column width (reserved for future upgrades; always 1 for now). */
  width: 1,
  /** A node counts as attacked until this long after the last hostile unit reached it, ms. */
  attackWindowMs: 1000,
  /** Balance lever only: stop the source's production while it releases a stream (decided: off). */
  pauseSourceProduction: false,
  /** Units of different sides closer than this touch and destroy each other, field widths. */
  contactDist: 0.01,
  /**
   * Distance from a node center where units appear and arrive, field widths, by node size: a bit less than the
   * drawn radius (NODE_RADIUS in game.ts: 0.055 / 0.068 / 0.084), so a unit appears still under the circle.
   */
  edgeDist: { small: 0.04, medium: 0.05, large: 0.062 } as Record<NodeSize, number>,
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
  /** Each defender withstands this many attackers (after the tower shots). */
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
  damageMin: 3,
} as const;

/** Boss of chapter 2 level 10 (CONTENT.md C-4.2). */
export const CITADEL = {
  waveEveryMs: 15000,
  /** Extra troops per wave, on top of the garrison. */
  waveSize: 10,
} as const;

/** Battle speed-up button (GDD 3.11): offered while the player owns more than `unlockShare` of all nodes. */
export const SPEED_UP = {
  unlockShare: 0.65,
  /** Simulation ticks per real tick while sped up. */
  multiplier: 2,
} as const;

/**
 * Slow-down while the player is choosing (BALANCE.md «Замедление»): a tutorial step waits for them, the build menu
 * is open, a swipe is being drawn, or a spell waits for its target. The whole battle runs at `speed`: 85% slower.
 */
export const SLOW_MO = {
  speed: 0.15,
} as const;

/** Tutorial (TUTORIAL.md T-4, BALANCE.md «Обучение»). */
export const TUTORIAL = {
  /** Info-only steps (`until: time`) last at most this long. */
  infoStepMaxSec: 4,
} as const;

export const SPELLS: Record<SpellId, { cost: number; cooldownSec: number }> & {
  fireball: { killShare: number; minKill: number };
  reinforcement: { troops: number };
  shield: { durationSec: number };
} = {
  fireball: { cost: 40, cooldownSec: 20, killShare: 0.4, minKill: 3 },
  reinforcement: { cost: 30, cooldownSec: 25, troops: 5 },
  /** Own node can't be attacked for durationSec: hostile units that arrive break on it. */
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
  /**
   * Value of a building, per level (PLAYTEST-1 F-3: a captured building changes owner intact): added to a target's
   * value, and own threatened nodes are defended in order of size value + this × level.
   */
  buildingValueBonus: 0.4,
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
  weakenedMinDrop: 2,
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
    startArmy: 1,
    troopProduction: 0.04,
    goldIncome: 0.05,
    unitStrength: 0.03,
  },
  /**
   * Bonuses not offered in Upgrades. Unit strength: 1 unit = 1 unit with stream armies (GDD 3.6, 4.3); the level
   * stays in the save. TODO(design): what replaces it (maybe the column width).
   */
  hidden: ['unitStrength'] as readonly string[],
} as const;

export const SPELL_UPGRADES = {
  maxLevel: 5,
  /** Stars spent on level n = starCosts[n - 1] (GDD 4.3). */
  starCosts: [2, 3, 4, 5, 6],
  perLevel: {
    fireball: { damageShare: 0.05, cooldownSec: -1 },
    reinforcement: { troops: 2, cooldownSec: -1 },
    shield: { durationSec: 1, cooldownSec: -1 },
  },
} as const;
