import en from './en.json';
import ru from './ru.json';

export type Lang = 'ru' | 'en';
export type Dictionary = Record<string, string>;

const DICTIONARIES: Record<Lang, Dictionary> = { ru, en };

let current: Lang = 'en';

/** Maps a platform/browser language code to a supported language: ru → ru, anything else → en. */
export function resolveLang(code: string | null | undefined): Lang {
  return (code ?? '').trim().toLowerCase().split(/[-_]/)[0] === 'ru' ? 'ru' : 'en';
}

export function initI18n(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/** Translates a key, substituting `{name}` placeholders. Falls back to English, then to the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = DICTIONARIES[current][key] ?? DICTIONARIES.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export const dictionaries: Readonly<Record<Lang, Dictionary>> = DICTIONARIES;
