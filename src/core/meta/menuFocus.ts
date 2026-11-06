import type { Progress } from './Progress';

/**
 * Main menu focus mode (docs/PLAYTEST-1.md F-1): on the first launch everything points at «Play» — the Map banner
 * is dimmed and not pressable, a finger shows the tap. On by `MENU_FOCUS.firstLaunch`; the URL parameter
 * `?menuFocus=on|off` overrides the flag (also in production, to compare both variants in the Yandex draft).
 */

/** `?menuFocus=on|off` → true / false; anything else (or no parameter) → null, the flag decides. */
export function parseMenuFocus(search: string): boolean | null {
  const value = new URLSearchParams(search).get('menuFocus');
  if (value === 'on') return true;
  if (value === 'off') return false;
  return null;
}

/** Focus mode is on while no level is won yet, if the URL override (or else the flag) allows it. */
export function isMenuFocus(progress: Progress, flag: boolean, override: boolean | null): boolean {
  return progress.completed.length === 0 && (override ?? flag);
}
