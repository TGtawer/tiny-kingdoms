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
  dim: 0x000000,
  select: 0xffffff,
  fireball: 0xff6a1a,
  reinforcement: 0x5ee07a,
  hint: 0xffe14d,
  faction: {
    player: 0x3b82f6,
    enemy: 0xef4444,
    neutral: 0x9ca3af,
  },
  factionDark: {
    player: 0x1e4fb8,
    enemy: 0xa82020,
    neutral: 0x5f6672,
  },
} as const;

/** Node radius in field units (fraction of field width), clamped to CSS px bounds. */
export const NODE_RADIUS: Record<NodeSize, number> = {
  small: 0.038,
  medium: 0.047,
  large: 0.058,
};
export const NODE_RADIUS_MIN_PX = 20;
export const NODE_RADIUS_MAX_PX = 58;
/** Extra touch slop around a node, CSS px; hit radius is never below MIN_TOUCH_PX / 2. */
export const NODE_HIT_SLOP_PX = 8;

export const ARMY_RADIUS_PX = 13;

export const HUD = {
  /** Top bar height, CSS px. */
  topBar: 60,
  /** Bottom bar height when spells are shown, CSS px. */
  bottomBar: 84,
  /** Field margin from screen edges and HUD bars, CSS px. */
  fieldMargin: 12,
  spellButton: 64,
  pauseButton: 52,
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

/** Pointer travel (CSS px) after which a press becomes a swipe. */
export const DRAG_THRESHOLD_PX = 12;

/** Max frame delta fed to the simulation, ms (avoids a burst of ticks after a stall). */
export const MAX_FRAME_DELTA_MS = 250;

/** Converts a 0xRRGGBB number to a CSS color string. */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
