import { afterEach, describe, expect, it } from 'vitest';
import { dictionaries, initI18n, resolveLang, t } from '../src/i18n/i18n';

afterEach(() => initI18n('en'));

describe('dictionaries', () => {
  it('ru and en have the same keys', () => {
    expect(Object.keys(dictionaries.ru).sort()).toEqual(Object.keys(dictionaries.en).sort());
  });

  it('has no empty strings', () => {
    for (const dict of Object.values(dictionaries)) {
      for (const value of Object.values(dict)) expect(value.trim()).not.toBe('');
    }
  });
});

describe('resolveLang', () => {
  it.each([
    ['ru', 'ru'],
    ['ru-RU', 'ru'],
    ['RU', 'ru'],
    ['en', 'en'],
    ['tr', 'en'],
    ['be', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ])('%s -> %s', (code, expected) => {
    expect(resolveLang(code)).toBe(expected);
  });
});

describe('t', () => {
  it('returns the current language string', () => {
    initI18n('ru');
    expect(t('boot.loading')).toBe(dictionaries.ru['boot.loading']);
    initI18n('en');
    expect(t('boot.loading')).toBe(dictionaries.en['boot.loading']);
  });

  it('falls back to the key for unknown keys', () => {
    expect(t('no.such.key')).toBe('no.such.key');
  });

  it('substitutes params and keeps unknown placeholders', () => {
    expect(t('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });
});
