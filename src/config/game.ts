// Render-side constants: sizes, colors, input thresholds. No gameplay numbers here (see balance.ts).
// Sizes marked "CSS px" are multiplied by the device pixel ratio at runtime (see view/layout.ts).

import type { BuildButtonStyle } from '../core/meta/buildButtonStyle';
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
  /** Evil mage tower (TUTORIAL.md T-7). */
  mage: 0x8b5cf6,
  mageDark: 0x4c1d95,
  /** Not taught yet (TUTORIAL.md T-3): dark face with a lock; text on it is light. */
  locked: 0x4b4a52,
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

/**
 * Node body (battle and chapter map): the dark rim lies exactly under the outline, the face is this share of the
 * radius smaller and higher inside it, so the rim shows as a lip below and nothing of the ground shows at the top.
 */
export const NODE_LIP = 0.08;
/** The same for squads on the road. */
export const SQUAD_LIP = 0.1;

/**
 * What a node shows (docs/PLAYTEST-1.md F-2, GDD 3.6 «Отображение»): the count, the owner color, the capacity arc
 * and the building badge change at most once per `refreshMs` (a lone change shows at once); a new owner shows only
 * after it held for `ownerStableMs`. View only: the simulation, tutorial, AI and victory use the real state.
 */
export const NODE_VIEW = {
  refreshMs: 250,
  ownerStableMs: 300,
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

/**
 * Units on the field (GDD 3.6, ARCHITECTURE.md «Производительность»): one small figure each, drawn in one batch.
 * Sizes in CSS px.
 */
export const UNITS_FX = {
  /** Unit radius as a share of the column step on screen (keeps a gap between figures), clamped below. */
  radiusOfStep: 0.36,
  minRadiusPx: 2.5,
  maxRadiusPx: 6,
  /** Flashes of clashes, tower shots and trades at a node: at most this many at once. */
  flashPool: 40,
  flashMs: 280,
  /** One flash per spot (a square of this size) at most every flashEverySpotMs. */
  flashSpotPx: 24,
  flashEverySpotMs: 100,
  flashRadiusPx: 9,
  /** The clash sound plays at most this often. */
  clashSoundEveryMs: 80,
} as const;

/** Dev-only helpers (never in a production build). */
export const DEV_TOOLS = {
  /** FPS and unit counter in the battle (dev server only). */
  showFps: true,
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
  /** Side of the seamless meadow tile under the map, CSS px. */
  meadowTile: 280,
  /** The node face is this share of the radius smaller and higher than the rim: a dark lip shows below. */
  nodeLip: NODE_LIP,
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

/**
 * Build menu buttons the player can't afford yet (docs/BUILD-BUTTON.md BB-3…BB-5). CSS px, ms, colors.
 * Starting numbers, tuned in the game.
 */
export const BUILD_BUTTON = {
  /** Look of an unaffordable button; `?buildBtn=grey|fill` overrides it. TODO(design): pick one after the playtest (BB-6). */
  style: 'grey' as BuildButtonStyle,
  /** A tap on an unaffordable button shakes it: x offsets (shares of `distance`) evenly over `ms`, back to 0. */
  shake: { distance: 5, ms: 360, keys: [0, -1, 1, -0.6, 0.6, 0] },
  /** When the gold first covers the price: the button grows to `popScale` at `peakAt` of `popMs` and back. */
  ready: { popScale: 1.08, popMs: 420, peakAt: 0.35 },
  /** BB-4: grey face (COLORS.buttonDisabled), no highlight. */
  grey: { iconAlpha: 0.55, text: 0x5d564c, price: 0xa82020, coinAlpha: 0.6 },
  /**
   * BB-5: a light grey face filling with gold from the left (share = floor(gold) / price), top to bottom gradient
   * in `bands` steps, rounded corners sampled with `arcSegments` points. Dark text with no stroke and the icon
   * as is: the dark text reads on both the gold and the grey (after the playtest review, 2026-11-07).
   */
  fill: {
    face: COLORS.buttonDisabled,
    top: 0xffc84d,
    bottom: 0xff9f1c,
    bands: 8,
    arcSegments: 6,
    /** Name, effect and price. */
    text: COLORS.textDark,
  },
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

/**
 * Whether the enemy leader card before the battle and the HUD portrait are shown (TUTORIAL.md T-2: off for now).
 * The leader still sets the AI behavior; the card code stays for later.
 */
export const SHOW_LEADER_INTRO = false;

/** Enemy leader card before the battle and the HUD portrait, CSS px / ms. */
export const LEADER_CARD = {
  autoCloseMs: 2500,
  portrait: 96,
  hudPortrait: 34,
} as const;

/** A card before the battle (view/introCard.ts: the leader card, the evil mage card of PLAYTEST-1 F-8), CSS px. */
export const INTRO_CARD = {
  width: 320,
  pad: 16,
  gap: 14,
  buttonWidth: 180,
  buttonHeight: 52,
  /** The mage card picture: the tower over its node, as on the field. */
  magePicture: 110,
} as const;

/** Guided-tour overlay outside battle (view/Spotlight.ts, TUTORIAL.md T-6), CSS px / ms. */
/**
 * Tutorial hint reactions (PLAYTEST-1 F-6): a refused action makes the hint plaque jump `bounce` CSS px up and back
 * in `bounceMs`, and the finger starts its gesture again. No text pops up.
 */
export const TUTORIAL_FX = {
  bounce: 10,
  bounceMs: 260,
  /** Refusals closer than this only restart the finger (no stacked jumps), ms. */
  bounceEveryMs: 300,
} as const;

export const SPOTLIGHT = {
  depth: 500,
  dimAlpha: 0.62,
  /** Space around the highlighted element and the corner radius of the hole. */
  pad: 6,
  radius: 14,
  pulseMs: 650,
  /** Finger tap loop, half period. */
  tapMs: 420,
  textMaxWidth: 340,
  textGap: 14,
  /** Extra room under the hole for the finger before the text. */
  fingerRoom: 46,
} as const;

/** Evil mage fireball flight from the tower to its target, ms (the damage is already applied). */
export const MAGE_FX = { flightMs: 380 } as const;

/** Look of every hint plaque (view/hintPlaque.ts), CSS px: as the tutorial hint bar. */
export const HINT_PLAQUE = {
  radius: 18,
  outline: 3,
  shadowX: 3,
  shadowY: 4,
  shadowAlpha: 0.35,
  padX: 14,
  padY: 8,
} as const;

/** How long the special node info label stays, ms. */
export const INFO_LABEL_MS = 2500;

/** Toast labels (view/effects.ts): min gap to the screen edges, CSS px. */
export const TOAST = { margin: 6 } as const;

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
/** Star corners: share of each edge cut off and bent into a curve at the tips and the inner corners (0..0.5). */
export const STAR_ROUNDING = { tip: 0.38, inner: 0.16 } as const;

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

/**
 * Main menu focus mode on the first launch (docs/PLAYTEST-1.md F-1): the Map banner dimmed and not pressable,
 * a finger taps the Play medallion. `?menuFocus=on|off` overrides `firstLaunch` (works in production too).
 */
export const MENU_FOCUS = {
  /** Off after the playtest (2026-11-06): the plain menu from the first launch; ?menuFocus=on still shows the mode. */
  firstLaunch: false,
  /** The finger appears this long after the menu opens, fading in, ms. */
  fingerFromMs: 1400,
  fingerFadeMs: 250,
  /** Tap loop: half period, ms, and how far the finger lifts, CSS px. */
  tapMs: 420,
  tapLift: 6,
  /** Fingertip offset from the medallion center, shares of its radius (on the lower right, not over the icon). */
  fingerAt: { x: 0.35, y: 0.45 },
} as const;

export const MENU_LAYOUT = {
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
 * Main menu with banners (docs/VISUALS.md V-4). Composition sizes are px of the reference screen
 * (360x640 portrait / 1280x720 landscape), scaled to fit; times are ms.
 */
export const MENU_FX = {
  /** Light band sweeping over the title letters (V-1.5); kept behind a flag until the playtest. */
  showShine: true,
  shine: {
    periodMs: 4000,
    durationMs: 800,
    width: 60,
    angleDeg: 20,
    alpha: 0.75,
  },
  /** Title: outline and drop shadow as shares of the font size; bob after the entrance. */
  titleStroke: 0.17,
  titleShadow: 0.1,
  titleBob: 4,
  titleBobSpeed: 2.2,
  entrance: {
    /** Toggles and crystals fade in. */
    cornerMs: 300,
    /** Title: fades in, drops from `titleFrom` (reference px above the top), then bobs. */
    titleFadeMs: 200,
    titleDropMs: 550,
    titleFrom: -40,
    titleBobFromMs: 700,
    /** Tournament poles grow, night beam opens (Cubic.Out). */
    framingFromMs: 100,
    framingMs: 350,
    nightBeamMs: 300,
    /** Banners drop one by one: map, upgrades, play; their content fades in over the last quarter. */
    bannerDelaysMs: [350, 450, 550],
    bannerMs: 500,
    contentFrom: 0.75,
    pulseFromMs: 1400,
  },
  /** Press: the banner swings and flashes; the scene changes after `leaveMs`. */
  press: { leaveMs: 150, impulseDecay: 0.9, flashAlpha: 0.35, flashDecay: 4 },
} as const;

export type MenuBannerId = 'map' | 'play' | 'up';

/** One banner = one button (docs/VISUALS.md V-4.2), reference px. */
export const MENU_BANNER = {
  /** Edges are polylines of this many segments; the tip hangs this far below the cloth. */
  segments: 12,
  tipH: 30,
  /**
   * sway(k) = sin(clock + phase - lag * k) * (amp + impAmp * imp) * k, where the clock runs at speed + impSpeed * imp
   * radians per second (a press swings the banner a bit harder and faster, then it calms down).
   */
  sway: { speed: 1.8, impSpeed: 2, lag: 2.3, amp: 3, impAmp: 6 },
  phase: { map: 1.7, play: 0, up: 3.1 },
  outline: 3,
  trimInset: 9,
  /** Light highlights on the cloth (flat: rim along the left edge; rich: the light folds). Off: plain cloth. */
  clothShine: false,
  /** Flat style (portrait). */
  flat: { shadowX: 3, shadowY: 3, shadowAlpha: 0.15, sleeve: 10, sleeveAlpha: 0.12, trim: 5, rimInset: 5, rimWidth: 3, rimAlpha: 0.22, rimFrom: 0.07, rimTo: 0.62 },
  /** Rich style (landscape): folds and a stitched trim. */
  rich: { shadowX: 4, shadowY: 7, shadowAlpha: 0.35, sleeve: 14, sleeveAlpha: 0.22, trim: 6, folds: 4, foldLight: 0.13, foldDark: 0.16, foldShift: 0.6, stitch: 1.5, stitchDash: 4, stitchGap: 3, stitchShade: -0.4 },
  /** Medallion: radius share of the banner width, gap above the label line, glow of Play. */
  medalMain: 0.23,
  medalSide: 0.24,
  medalGap: 6,
  medalAt: 0.42,
  /** The medallion and the labels follow the cloth at these shares of its length. */
  medalSway: 0.45,
  medalShine: { x: -0.32, y: -0.48, rx: 0.36, ry: 0.16, angle: -0.35, alpha: 0.3 },
  medalRing: { inset: 5, width: 1.5, dash: 3, gap: 4, shade: -0.45, rimShade: -0.35 },
  iconScale: 1.1,
  /** Locked banner (TUTORIAL.md T-3): cloth and trim darkened, medallion dimmed with a lock on a light disc. */
  locked: { shade: -0.55, medalDim: 0.55, lockDisc: 0.55, lockSize: 0.62, labelAlpha: 0.7 },
  pulse: { pad: 8, color: 0xffe68c, alpha: 0.5, periodMs: 1600 },
  /** Labels: font size share of the width (side banners capped), the second line smaller and yellow. */
  labelMain: 0.2,
  labelSide: 0.165,
  labelSideMax: 20,
  labelSecond: 0.65,
  labelSecondColor: 0xfde68a,
  labelStroke: 5,
  labelSecondStroke: 4,
  labelAt: 0.55,
} as const;

/** «Tournament» menu, portrait (docs/VISUALS.md V-4.3, docs/prototypes/menu-mobile-tournament.html). */
export const MENU_TOURNAMENT = {
  ref: { w: 360, h: 640 },
  title: { x: 180, y: 120, size: 46 },
  banners: [
    // The side banners hang a little lower than Play.
    { id: 'map', x: 62, y: 280, w: 92, len: 206 },
    { id: 'up', x: 298, y: 280, w: 92, len: 206 },
    { id: 'play', x: 180, y: 266, w: 124, len: 268 },
  ],
  colors: { main: 0xb91c1c, side: 0x1e40af, trim: 0xffc83d },
  sky: { top: '#8fd0f5', bottom: '#e3f5ff', to: 330 },
  grassFrom: 320,
  tufts: { count: 34, from: 340, seed: 21 },
  /** Posts every `postEvery`, placed symmetrically around the screen center. */
  fence: { y: 352, h: 6, postEvery: 30, postTop: 340, postW: 6, postH: 26, color: '#c08a4b' },
  tents: [
    { x: 20, y: 330, w: 88, h: 98, color: '#dc2626' },
    { x: 340, y: 330, w: 88, h: 98, color: '#2563eb' },
    { x: 130, y: 324, w: 46, h: 52, color: '#2563eb' },
    { x: 236, y: 324, w: 46, h: 52, color: '#dc2626' },
  ],
  garland: { ax: 20, ay: 232, bx: 340, by: 232, sag: 30, points: 40, flags: 13, flagW: 11, flagH: 12, colors: [0xdc2626, 0xffc83d, 0x2563eb] },
  pole: { color: 0x8a5a2b, width: 7, outline: 2.5, above: 40, playAbove: 14, bottom: 620, below: 60 },
  crossbar: { pad: 4, h: 10, y: -6, radius: 5, ball: 5 },
} as const;

/** «Night castle» menu, landscape (docs/VISUALS.md V-4.4, docs/prototypes/menu-desktop-night.html). */
export const MENU_NIGHT = {
  ref: { w: 1280, h: 720 },
  title: { x: 640, y: 150, size: 64 },
  beamY: 290,
  banners: [
    { id: 'map', x: 400, y: 290, w: 124, len: 236 },
    { id: 'up', x: 880, y: 290, w: 124, len: 236 },
    { id: 'play', x: 640, y: 290, w: 150, len: 300 },
  ],
  colors: { main: 0xb91c1c, mainTrim: 0xffc83d, side: 0x1e3a8a, sideTrim: 0xfcd34d },
  lanterns: [300, 520, 760, 980],
  moon: { x: 1060, y: 120, r: 36, halo: 110, color: '#fff4cf' },
  sky: ['#0f1b3d', '#22356b', '#2d4a7a'],
  castle: '#16233f',
  /** Battlements: size and spacing; towers narrower than roofMaxW get a pointed roof of height roofH instead. */
  merlon: { w: 7, h: 8, every: 11 },
  roofMaxW: 50,
  roofH: 40,
  /** Walls between the towers [x, y, width, height]: deep enough to reach into the hill (no sky below them). */
  walls: [
    [90, 520, 330, 100],
    [870, 520, 330, 100],
  ],
  ground: { y: 640, color: '#0d1630' },
  /** [x, width, height] of each tower; narrow ones get a pointed roof. */
  towers: [
    [90, 40, 150],
    [190, 70, 90],
    [300, 34, 190],
    [420, 80, 110],
    [870, 80, 110],
    [990, 34, 200],
    [1100, 70, 95],
    [1200, 40, 160],
  ],
  stars: { count: 170, maxY: 470, seed: 77, color: 0xfff7d6 },
  windows: { seed: 3, color: 0xffcd6e },
  fireflies: { count: 24, fromY: 330, height: 360, glow: 9, color: [230, 255, 140] as const },
  /**
   * Outline of the beam and the lanterns, reference px. Both are drawn on whole screen pixels with this width
   * rounded to an even number of screen pixels, so their edges are equally sharp at any frame scale.
   */
  outline: 2,
  /** The beam: side overhang past the banners and lanterns, height, corner radius; the highlight band on top. */
  beam: { pad: 50, h: 22, radius: 10, color: 0x5b3a1f, shine: { inset: 6, top: 3, h: 6, radius: 3, alpha: 0.12 } },
  /**
   * Lanterns under the beam (reference px from the beam center line): hook from `top` down `hook`, body w x h
   * with corner radius r, caps capW x capH at `caps` offsets, glow radius `glow` centered `glowY` below `top`.
   */
  lantern: {
    glow: 140,
    glowY: 18,
    body: 0xffd56b,
    cap: 0x374151,
    top: 9,
    hook: 8,
    w: 16,
    h: 20,
    r: 4,
    capW: 20,
    capH: 4,
    caps: [6, 27],
  },
} as const;

/** Main menu medallion icons (view/icons.ts drawMenuIcon). */
export const MENU_ICON = {
  /** Corner radius of the Play triangle, share of the icon box; each corner is drawn with `cornerSegments` steps. */
  playCorner: 0.12,
  cornerSegments: 6,
} as const;

