// Render-side constants: sizes, colors, input thresholds. No gameplay numbers here (see balance.ts).
// Sizes marked "CSS px" are multiplied by the device pixel ratio at runtime (see view/layout.ts).

import type { NodeSize } from './balance';

/** Reference viewports every scene must be checked in. */
export const REFERENCE_PORTRAIT = { width: 360, height: 640 } as const;
export const REFERENCE_LANDSCAPE = { width: 1280, height: 720 } as const;

/** Render at most at this device pixel ratio (crisp enough, cheap enough for weak Android). */
export const MAX_DPR = 2;

/** Minimum touch target size, CSS px. */
export const MIN_TOUCH_PX = 48;

export const FONT_FAMILY = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';

export const COLORS = {
  background: 0x7cc46a,
  backgroundDark: 0x5fa653,
  text: 0xffffff,
  textDark: 0x1f2937,
  outline: 0x1f2937,
  road: 0xf0dca0,
  roadEdge: 0xb89a5a,
  gold: 0xffc83d,
  goldDark: 0xb7811a,
  panel: 0xfff6e0,
  panelEdge: 0x8a5a2b,
  button: 0xffb53d,
  buttonPressed: 0xe8962a,
  buttonDisabled: 0xc9bfae,
  /** Secondary buttons next to a main one (result panel). */
  buttonSecondary: 0xf2dcae,
  starEmpty: 0x8b8578,
  portal: 0xa855f7,
  bandits: 0x3f3f46,
  dim: 0x000000,
  select: 0xffffff,
  fireball: 0xff6a1a,
  reinforcement: 0x5ee07a,
  shield: 0x7dd3fc,
  hint: 0xffe14d,
  /** Swipe line when the attack is predicted to capture the target / not enough troops. */
  attackWin: 0x4ade80,
  attackShort: 0xfacc15,
  faction: {
    player: 0x3b82f6,
    enemy: 0xef4444,
    /** Second enemy: green, contrasts with blue, red and grey. */
    enemy2: 0x22c55e,
    neutral: 0x9ca3af,
  },
  factionDark: {
    player: 0x1e4fb8,
    enemy: 0xa82020,
    enemy2: 0x15803d,
    neutral: 0x5f6672,
  },
} as const;

/** Node radius in field units (fraction of field width), clamped to CSS px bounds. */
export const NODE_RADIUS: Record<NodeSize, number> = {
  small: 0.055,
  medium: 0.068,
  large: 0.084,
};
export const NODE_RADIUS_MIN_PX = 26;
export const NODE_RADIUS_MAX_PX = 58;
/** Extra touch slop around a node, CSS px; hit radius is never below MIN_TOUCH_PX / 2. */
export const NODE_HIT_SLOP_PX = 8;

export const ARMY_RADIUS_PX = 13;

/** Marching army look: scale bob and trail dots behind it (CSS px, ms). */
export const ARMY_FX = {
  bob: 0.07,
  bobPeriodMs: 110,
  trailDots: 3,
  trailSpacing: 10,
} as const;

export const HUD = {
  /** Top bar height, CSS px. */
  topBar: 60,
  /** Bottom bar height when spells are shown, CSS px. */
  bottomBar: 84,
  /** Field margin from screen edges and HUD bars, CSS px. */
  fieldMargin: 12,
  spellButton: 64,
  pauseButton: 52,
  /** Gap between buttons in the top bar (speed-up and pause), CSS px. */
  topBarGap: 8,
  /** The level title in the top bar shrinks to fit; below this scale it is hidden. */
  titleMinScale: 0.75,
  /** Goal plaque under the top bar (non-conquer goals), CSS px. */
  goalBar: 30,
  /** Tutorial hint panel height reserved at the bottom, CSS px. */
  hintBar: 88,
  hintMaxWidth: 560,
} as const;

/** Chapter map, CSS px. Nodes keep this size; the map scrolls when the path does not fit. */
export const MAP = {
  nodeRadius: 36,
  /** Distance between neighbouring levels along the path. */
  spacing: 118,
  /** Free space before the first and after the last level. */
  margin: 80,
  /** Max side-to-side swing of the path. */
  amplitude: 110,
  /** Phase step of the swing per level, radians. */
  waveStep: 1.1,
  /** Star size under completed levels. */
  starSize: 18,
  /** White highlight on the level nodes (upper left). */
  nodeShineAlpha: 0.28,
  /** The node face is this share of the radius smaller and higher than the rim: a dark lip shows below. */
  nodeLip: 0.08,
} as const;

/**
 * Living chapter map (docs/VISUALS.md V-2, prototype docs/prototypes/living-screens.html).
 * Sizes CSS px, speeds px/s or rad/s, times ms. Each `show*` flag turns one effect off for profiling.
 */
export const MAP_FX = {
  showToken: true,
  showRoadProgress: true,
  showDecor: true,
  showSway: true,
  showClouds: true,
  showWalker: true,

  /** Player squad hopping over the current level. */
  token: { radius: 13, lift: 18, hop: 10, hopSpeed: 3.2, shadowLift: 6, shadowW: 10, shadowH: 3.5, shadowAlpha: 0.2 },
  /** Road ahead of the current level is dimmed; running dashes lead from the last completed level to it. */
  road: { edgeWidth: 18, width: 11, futureAlpha: 0.5, dash: 10, gap: 12, dashWidth: 4, dashSpeed: 28 },
  /** Small squad walking the completed path back and forth. */
  walker: { radius: 8, segmentMs: 4200, bob: 2, bobSpeed: 9 },
  decor: {
    count: 45,
    maxTries: 4000,
    /** Clearance beyond the node radius + item radius, from the road line, between items; margin from the world edge. */
    nodeClearance: 22,
    roadClearance: 14,
    itemGap: 4,
    edge: 16,
    outline: 2,
    kinds: [
      { kind: 'tree', radius: 14, weight: 5 },
      { kind: 'pine', radius: 13, weight: 4 },
      { kind: 'bush', radius: 9, weight: 3 },
      { kind: 'house', radius: 15, weight: 1.4 },
      { kind: 'pond', radius: 22, weight: 0.5, max: 2 },
      { kind: 'mill', radius: 18, weight: 0.35, max: 2 },
    ],
    /** Ground shadow ellipse per kind, centered under the item: [dy, rx, ry] from the item position. */
    shadows: {
      tree: [10, 12, 4],
      pine: [10, 10, 3.5],
      bush: [6, 10, 3.5],
      house: [9, 15, 4],
      mill: [12, 14, 4],
    },
    /** Trees and pines are anchored at the trunk foot (their sway pivot), this far below the item position. */
    footY: { tree: 10, pine: 11 },
    shadowAlpha: 0.16,
    /** Tree and pine sway around the base: amplitude, speed (rad/s of the sine). */
    swayDeg: 2,
    swaySpeed: 1.6,
    /** Mill sails, rad/s; their hub above the mill base, CSS px. */
    sailSpeed: 1.4,
    sailHub: 12,
    /** Chimney smoke: one puff grows and fades over this time, moving from (x, y) by (dx, dy), radius r0 → r1. */
    smoke: { ms: 2000, x: 7, y: -18, dx: 6, dy: -16, r0: 3, r1: 7, alpha: 0.55 },
    colors: {
      pond: 0x4fa3d9,
      bush: 0x3f8f3a,
      tree: [0x2f8a3a, 0x3c9a3f],
      pine: 0x25704a,
      trunk: 0x8a5a2b,
      wall: 0xfff6e0,
      roof: [0xd9534f, 0xc2703d],
      window: 0xffd56b,
      sails: 0xe9e1cc,
    },
  },
  /**
   * Level-open animation after a first win (V-3), ms from entering the map. A replay that improved the
   * stars plays only the pop and the new stars.
   */
  reveal: {
    popScale: 1.16,
    popMs: 250,
    checkDelayMs: 150,
    checkMs: 300,
    starDelaysMs: [350, 600, 850],
    starMs: 300,
    /** Sparks per earned star: count, distance CSS px, duration, dot radius CSS px. */
    starSparks: { count: 8, distance: 25, ms: 500, size: 2.5 },
    cameraStartMs: 900,
    cameraMs: 1400,
    roadStartMs: 1100,
    roadMs: 800,
    /** The lock shakes ±shakePx along x, ramping up over shakeRampMs; shakeSpeed rad/s. */
    shakeStartMs: 1900,
    shakeRampMs: 200,
    shakePx: 3,
    shakeSpeed: 60,
    /** The lock breaks: halves fly ±halfDx, arc up halfUp and drop halfDrop, spin halfSpin rad, fade over breakMs. */
    breakAtMs: 2400,
    breakMs: 700,
    halfDx: 34,
    halfUp: 26,
    halfDrop: 46,
    halfSpin: 1.6,
    /** The opened level grows from 0. */
    growMs: 350,
    openSparks: 12,
    /** The token hops to the opened level. */
    hopStartMs: 2600,
    hopMs: 800,
    hops: 3,
    hopHeight: 22,
    endMs: 3500,
  },
  clouds: {
    count: 7,
    alpha: 0.92,
    /** Parallax: clouds move this many times faster than the ground when the map scrolls. */
    parallax: 1.4,
    /** Drift px/s: speedMin + (i % 4) * speedStep; size: 0.8 + (i % 3) * 0.3. */
    speedMin: 4,
    speedStep: 2,
    /** White blobs [dx, dy, rx], ry = rx * 0.7; the shadow blobs [dx, dy, rx], ry = rx * 0.6, offset below-right. */
    blobs: [
      [0, 0, 26],
      [24, 4, 20],
      [-22, 6, 18],
      [8, -10, 18],
    ],
    shadowBlobs: [
      [0, 0, 26],
      [24, 4, 20],
      [-22, 6, 18],
    ],
    shadowOffset: [18, 26],
    shadowColor: 0x143c14,
    shadowAlpha: 0.12,
  },
} as const;

/** Build menu strip in the bottom HUD bar, CSS px. */
export const BUILD_MENU = {
  /** Max button width when several options are shown (shrinks to fit narrow screens). */
  buttonWidth: 132,
  /** Max button width for a single upgrade / max-level button. */
  singleButtonWidth: 180,
  buttonHeight: 66,
  gap: 10,
  /** Side margin of the button row. */
  padding: 12,
  /** Min vertical space between a button and the bar edges. */
  barInset: 6,
} as const;

/** Victory/defeat panel, CSS px and ms. */
export const RESULT_PANEL = {
  primaryButtonHeight: 68,
  /** At most this many crystal icons fly to the counter. */
  flyingCrystals: 8,
  flyDelayMs: 450,
  flyStaggerMs: 90,
  flyDurationMs: 520,
  starSize: 40,
  /** Width given to each star and its caption, CSS px (shrinks on narrow panels). */
  starSlot: 92,
  starLabelSize: 13,
  /** Room under the stars for the captions, CSS px. */
  starLabelH: 18,
  /** Delay between stars appearing one by one. */
  starStaggerMs: 260,
} as const;

/** Sound and haptics. */
export const SFX = {
  /** Master volume, 0..1. */
  volume: 0.5,
  /** Gain of effects played from files (on top of `volume`); files are mastered louder than the synth. */
  fileVolume: 0.8,
  /** Effects with a file public/audio/sfx_<id>.mp3 (docs/AUDIO.md); the others stay synthesized. */
  files: ['click'] as readonly string[],
  /** Skipped at the start of effect files: MP3 encoder delay, s. */
  fileOffsetSec: 0,
} as const;

/** Music tracks (looped) and jingles (once), files public/audio/<id>.mp3 — see docs/AUDIO.md. */
export type MusicId = 'music_menu' | 'music_upgrades' | 'music_battle_1' | 'music_battle_2' | 'music_battle_3' | 'music_boss';
export type JingleId = 'jingle_victory' | 'jingle_victory_3star' | 'jingle_defeat' | 'jingle_chapter';

export const MUSIC = {
  /** Music volume, 0..1. */
  volume: 0.45,
  /** Jingle volume, 0..1. */
  jingleVolume: 0.6,
  /** Music level while the battle pause panel is open, share of `volume`. */
  pauseDuck: 0.4,
  /** Crossfade between tracks, ms. */
  crossfadeMs: 500,
  /** Music fade-out when a battle ends, ms. */
  endFadeMs: 300,
  /** Tracks that have a file. Add the ID when a file is added to public/audio/; the rest stay silent. */
  files: [
    'music_menu',
    'music_upgrades',
    'music_battle_1',
    'music_battle_2',
    'music_battle_3',
    'jingle_victory',
    'jingle_victory_3star',
    'jingle_defeat',
  ] as ReadonlyArray<MusicId | JingleId>,
  /** Battle rotation order (docs/AUDIO.md A-2); only IDs that are also in `files` play. */
  battleTracks: ['music_battle_1', 'music_battle_2', 'music_battle_3'] as readonly MusicId[],
} as const;
export const HAPTICS = {
  /** Own node captured or lost, ms. */
  short: 35,
  /** Victory pattern, ms (vibrate, pause, vibrate). */
  victory: [90, 60, 180],
  /** Camera shake on a fireball or an enemy capital captured. */
  shakeMs: 150,
  shakeIntensity: 0.004,
} as const;

/** Enemy leader card before the battle and the HUD portrait, CSS px / ms. */
export const LEADER_CARD = {
  autoCloseMs: 2500,
  portrait: 96,
  hudPortrait: 34,
} as const;

/** How long the special node info label stays, ms. */
export const INFO_LABEL_MS = 2500;

/** Pointer travel (CSS px) after which a press becomes a swipe. */
export const DRAG_THRESHOLD_PX = 12;

/** Max frame delta fed to the simulation, ms (avoids a burst of ticks after a stall). */
export const MAX_FRAME_DELTA_MS = 250;

/** Converts a 0xRRGGBB number to a CSS color string. */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Shield dome over a protected node. */
export const SHIELD_FX = {
  /** Dome radius relative to the node radius. */
  radius: 1.3,
  fillAlpha: 0.22,
  /** The dome blinks during the last ms of the shield. */
  blinkMs: 2000,
} as const;

/** Main menu UI layer, CSS px. */
/** Look of every Button (as in docs/prototypes/living-screens.html), CSS px. */
export const BUTTON_STYLE = {
  radius: 16,
  outline: 3,
  /** Soft shadow under the face: offset down and opacity. */
  shadowOffset: 5,
  shadowAlpha: 0.35,
  /** Permanent highlight band in the upper part: inset from the sides and the top, height share, radius. */
  shineInset: 6,
  shineTop: 5,
  shineHeight: 0.32,
  shineRadius: 10,
  shineAlpha: 0.22,
  /** The face moves down this much while pressed. */
  pressDrop: 3,
} as const;

export const MENU_LAYOUT = {
  panelPadding: 20,
  /** Room left on each side of the buttons, CSS px. */
  sideClearance: 30,
  panelAlpha: 0.88,
  /** Title drop shadow offset, CSS px. */
  titleShadow: 5,
  /** Flowers per (100 CSS px)^2 on the menu meadow. */
  flowerDensity: 1.6,
  flowerColors: [0xfde047, 0xf9a8d4, 0xffffff, 0xc4b5fd],
  /** Round sound / music toggles in the top-left corner, CSS px (drawn 44, touch area 48). */
  toggleSize: 44,
  toggleHit: 48,
  toggleMargin: 12,
  toggleGap: 8,
  /** Shadow under a toggle, CSS px down (opacity and outline as BUTTON_STYLE). */
  toggleShadow: 4,
  /** Highlight on a toggle: ellipse center above the middle and half-axes, shares of the radius. */
  toggleShineY: 0.48,
  toggleShineW: 0.62,
  toggleShineH: 0.26,
  /** Icon box inside a toggle. */
  toggleIcon: 24,
} as const;

/**
 * Living main menu (docs/VISUALS.md V-1, prototype docs/prototypes/living-screens.html).
 * Sizes are CSS px of a 360x640 portrait; times are ms. Each `show*` flag turns one effect off for profiling.
 */
export const MENU_FX = {
  showBattle: true,
  showVeil: true,
  showCloudShadows: true,
  showBirds: true,
  showShine: true,
  showPulse: true,
  showEntrance: true,

  /** AI-vs-AI backdrop battle (src/levels/menu_background.json). */
  battle: {
    /** The level frame (its coordinates are this portrait divided by its height). */
    frameW: 360,
    frameH: 640,
    /** Simulation speed: armies of a real battle look too fast on the small menu field. */
    simSpeed: 0.6,
    nodeRadius: { small: 18, medium: 21, large: 24 },
    /** Nodes grow with the screen, but not beyond this factor. */
    maxRadiusScale: 1.4,
    armyScale: 0.85,
    /** A battle that lasts longer than this is restarted anyway, s. */
    maxSec: 120,
    /** Pause after a battle is decided, then the fade-out, then a new battle. */
    restartDelayMs: 3000,
    fadeMs: 500,
  },
  /** Meadow-colored veil between the battle and the UI. */
  veilAlpha: 0.42,
  cloudShadows: {
    color: 0x143c14,
    alpha: 0.1,
    /** One shadow = a few ellipses [dx, dy, rx]; ry = rx * flatten. */
    blobs: [
      [0, 0, 46],
      [44, -8, 38],
      [-40, 6, 34],
      [20, 18, 36],
    ],
    flatten: 0.62,
    /** Each shadow: start x and y as a share of the screen, size scale, speed px/s. */
    items: [
      { x: 0.11, y: 0.22, scale: 1.2, speed: 7 },
      { x: 0.72, y: 0.66, scale: 1.6, speed: 5 },
      { x: -0.33, y: 0.88, scale: 1, speed: 9 },
    ],
  },
  birds: {
    minGapMs: 6000,
    maxGapMs: 12000,
    flightMs: 7000,
    /** Flight height band: top and height, CSS px. */
    bandTop: 60,
    bandHeight: 80,
    /** Wing half-span and flap amplitude, CSS px; flap speed rad/s. */
    wing: 7,
    flapAmp: 4,
    flapSpeed: 11,
    lineWidth: 2,
    /** The second bird: behind, lower, phase-shifted. */
    followX: 16,
    followY: 9,
    followPhase: 1.3,
  },
  shine: {
    periodMs: 4000,
    durationMs: 800,
    width: 60,
    angleDeg: 20,
    alpha: 0.75,
  },
  pulse: {
    scale: 1.035,
    periodMs: 1600,
    glowPad: 7,
    glowColor: 0xffe078,
    glowAlpha: 0.45,
  },
  entrance: {
    titleDrop: 140,
    titleMs: 600,
    /** Toggles and crystals fade in. */
    cornerMs: 300,
    panelDelayMs: 150,
    panelMs: 350,
    panelFromScale: 0.9,
    buttonDelaysMs: [300, 390, 480],
    buttonMs: 320,
    buttonRise: 60,
  },
  /** Title bob after the entrance: CSS px and half-period. */
  titleBob: 6,
  titleBobMs: 1400,
} as const;

