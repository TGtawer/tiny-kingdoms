import { describe, expect, it } from 'vitest';
import { isMenuFocus, parseMenuFocus } from '../../../src/core/meta/menuFocus';
import { defaultProgress } from '../../../src/core/meta/Progress';

describe('main menu focus mode (PLAYTEST-1 F-1)', () => {
  it('reads ?menuFocus=on|off; anything else leaves it to the flag', () => {
    expect(parseMenuFocus('?menuFocus=on')).toBe(true);
    expect(parseMenuFocus('?level=c01_l02&menuFocus=off')).toBe(false);
    expect(parseMenuFocus('?menuFocus=yes')).toBeNull();
    expect(parseMenuFocus('')).toBeNull();
  });

  it('is on only while nothing is won, by the flag unless the URL overrides it', () => {
    const fresh = defaultProgress();
    expect(isMenuFocus(fresh, true, null)).toBe(true);
    expect(isMenuFocus(fresh, false, null)).toBe(false);
    expect(isMenuFocus(fresh, false, true)).toBe(true);
    expect(isMenuFocus(fresh, true, false)).toBe(false);

    const played = defaultProgress();
    played.completed = ['c01_l01'];
    expect(isMenuFocus(played, true, true)).toBe(false);
  });
});
