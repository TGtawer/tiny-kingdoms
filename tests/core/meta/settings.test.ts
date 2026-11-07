import { describe, expect, it } from 'vitest';
import { clampVolume, DEFAULT_VOLUME, resolveLangSetting } from '../../../src/core/meta/settings';

describe('volume setting', () => {
  it('keeps a volume inside 0..1', () => {
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(0.35)).toBe(0.35);
    expect(clampVolume(1)).toBe(1);
  });

  it('clamps a volume outside 0..1', () => {
    expect(clampVolume(-0.2)).toBe(0);
    expect(clampVolume(7)).toBe(1);
  });

  it('turns garbage into the default (full)', () => {
    expect(DEFAULT_VOLUME).toBe(1);
    for (const bad of [NaN, Infinity, -Infinity, '0.5', null, undefined, {}, true]) expect(clampVolume(bad)).toBe(DEFAULT_VOLUME);
  });
});

describe('language setting', () => {
  it('without a saved choice follows the platform', () => {
    expect(resolveLangSetting(null, 'ru')).toBe('ru');
    expect(resolveLangSetting(null, 'en')).toBe('en');
  });

  it('a saved choice wins over the platform', () => {
    expect(resolveLangSetting('en', 'ru')).toBe('en');
    expect(resolveLangSetting('ru', 'en')).toBe('ru');
  });
});
