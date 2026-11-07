import { describe, expect, it } from 'vitest';
import { clampVolume, DEFAULT_VOLUME, resolveLangSetting, volumeAt } from '../../../src/core/meta/settings';

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

describe('volume slider', () => {
  it('maps the track to 0..1 in 5% steps', () => {
    expect(volumeAt(100, 100, 300, 0.05)).toBe(0);
    expect(volumeAt(300, 100, 300, 0.05)).toBe(1);
    expect(volumeAt(200, 100, 300, 0.05)).toBe(0.5);
    // 31% of the track rounds to 30%, 33% to 35%.
    expect(volumeAt(162, 100, 300, 0.05)).toBe(0.3);
    expect(volumeAt(166, 100, 300, 0.05)).toBe(0.35);
    expect(volumeAt(130, 100, 300, 0.05)).toBe(0.15);
  });

  it('stops at the ends when the finger goes past them', () => {
    expect(volumeAt(-50, 100, 300, 0.05)).toBe(0);
    expect(volumeAt(900, 100, 300, 0.05)).toBe(1);
  });
});
