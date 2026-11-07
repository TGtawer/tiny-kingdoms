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
