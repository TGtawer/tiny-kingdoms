import type { Lang } from '../../i18n/i18n';

/**
 * Player settings logic (sound/music volume, language). Pure, no Phaser.
 * The volumes are multipliers on SFX.volume and MUSIC.volume (config/game.ts).
 */

/** Volume of a channel nobody has touched yet: full. */
export const DEFAULT_VOLUME = 1;

/** A volume kept in 0..1; anything that is not a finite number becomes the default. */
export function clampVolume(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, v));
}

/** The language to show: the player's own choice wins over the platform's language. */
export function resolveLangSetting(saved: Lang | null, platformLang: Lang): Lang {
  return saved ?? platformLang;
}

/**
 * Volume for a point on a slider from `x0` (0) to `x1` (1): clamped to the ends and rounded to `step`
 * (0.05 = 5%), so the slider moves in even steps.
 */
export function volumeAt(x: number, x0: number, x1: number, step: number): number {
  const share = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
  const stepped = Math.round(Math.min(1, Math.max(0, share)) / step) * step;
  // Rounding noise of the step (0.15000000000000002) never reaches the save.
  return Math.round(stepped * 1000) / 1000;
}
