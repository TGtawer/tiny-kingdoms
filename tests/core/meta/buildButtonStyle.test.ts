import { describe, expect, it } from 'vitest';
import { parseBuildButtonStyle } from '../../../src/core/meta/buildButtonStyle';

describe('?buildBtn URL parameter (BUILD-BUTTON BB-3)', () => {
  it('reads grey and fill', () => {
    expect(parseBuildButtonStyle('?buildBtn=grey')).toBe('grey');
    expect(parseBuildButtonStyle('?level=c01_l04&buildBtn=fill')).toBe('fill');
  });

  it('ignores an unknown value', () => {
    expect(parseBuildButtonStyle('?buildBtn=red')).toBeNull();
    expect(parseBuildButtonStyle('?buildBtn=')).toBeNull();
  });

  it('is null without the parameter', () => {
    expect(parseBuildButtonStyle('')).toBeNull();
    expect(parseBuildButtonStyle('?menuFocus=on')).toBeNull();
  });
});
