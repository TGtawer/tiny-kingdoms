import { initI18n, type Lang } from '../i18n/i18n';
import type { SaveStore } from '../save/SaveStore';

/**
 * Applies and saves player settings in one place, so the menu and the battle pause stay in step.
 */

/** Switches the language at once and remembers it; it then wins over the platform's language on every start. */
export function setLang(store: SaveStore, lang: Lang): void {
  initI18n(lang);
  store.settings.lang = lang;
  store.commit();
}
