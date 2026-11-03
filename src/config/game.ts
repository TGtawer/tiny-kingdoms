// Render-side constants: sizes, colors, input thresholds. No gameplay numbers here (see balance.ts).

/** Reference viewports every scene must be checked in. */
export const REFERENCE_PORTRAIT = { width: 360, height: 640 } as const;
export const REFERENCE_LANDSCAPE = { width: 1280, height: 720 } as const;

/** Minimum touch target size in CSS pixels. */
export const MIN_TOUCH_PX = 48;

export const COLORS = {
  background: 0x2b3a55,
  text: 0xffffff,
  faction: {
    player: 0x3b82f6,
    enemy: 0xef4444,
    neutral: 0x9ca3af,
  },
} as const;

export const FONT_FAMILY = 'Arial, Helvetica, sans-serif';

/** Converts a 0xRRGGBB number to a CSS color string. */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
