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
export const MENU_LAYOUT = {
  panelPadding: 18,
  /** Room left on each side of the buttons, CSS px. */
  sideClearance: 30,
  panelAlpha: 0.88,
  /** Title drop shadow offset, CSS px. */
  titleShadow: 5,
  /** Flowers per (100 CSS px)^2 on the menu meadow. */
  flowerDensity: 1.6,
  flowerColors: [0xfde047, 0xf9a8d4, 0xffffff, 0xc4b5fd],
  /** Sound / music toggle buttons in the top-left corner, CSS px. */
  toggleSize: 48,
  toggleMargin: 10,
  toggleGap: 8,
} as const;

