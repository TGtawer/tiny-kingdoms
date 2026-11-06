import { describe, expect, it } from 'vitest';
import { NODE_VIEW } from '../../src/config/game';
import { DisplayFilter, SHOWN_CHANGED, SHOWN_OWNER_CHANGED } from '../../src/view/displayFilter';
import type { Owner } from '../../src/core/sim/World';

const filter = (owner: Owner = 'neutral', troops = 5): DisplayFilter => new DisplayFilter(owner, troops, NODE_VIEW.refreshMs, NODE_VIEW.ownerStableMs);

describe('node display filter (PLAYTEST-1 F-2)', () => {
  it('a lone change after a quiet spell shows at once', () => {
    const f = filter('player', 5);
    expect(f.update(1000, 'player', 6)).toBe(SHOWN_CHANGED);
    expect(f.troops).toBe(6);
    expect(f.update(2000, 'player', 7)).toBe(SHOWN_CHANGED);
    expect(f.troops).toBe(7);
  });

  it('frequent changes show at most 4 times a second, the latest value at the end of each window', () => {
    const f = filter('player', 20);
    let shown = 0;
    let troops = 20;
    // Units arriving 10 times a second for 3 s, a frame every 16 ms.
    for (let now = 0; now <= 3000; now += 16) {
      if (now % 100 < 16) troops += 1;
      if (f.update(now, 'player', troops)) shown++;
    }
    expect(shown).toBeLessThanOrEqual(3 * 4 + 1);
    expect(shown).toBeGreaterThanOrEqual(3 * 4 - 1);
    // Quiet again: the real value shows within one window.
    let now = 3016;
    while (f.troops !== troops) f.update((now += 16), 'player', troops);
    expect(now - 3000).toBeLessThanOrEqual(NODE_VIEW.refreshMs + 16);
  });

  it('an owner change shorter than ownerStableMs never shows; the count freezes meanwhile', () => {
    const f = filter('player', 1);
    // 0 ↔ 1 ping-pong: the enemy holds the node for 200 ms at a time.
    for (let now = 0; now < 3000; now += 16) {
      const enemy = Math.floor(now / 200) % 2 === 1;
      expect(f.update(now, enemy ? 'enemy' : 'player', enemy ? 1 : now % 3) & SHOWN_OWNER_CHANGED).toBe(0);
      expect(f.owner).toBe('player');
      if (enemy) expect(f.troops).toBeLessThanOrEqual(2);
    }
  });

  it('an owner held for ownerStableMs shows, with its count, and reports the previous owner', () => {
    const f = filter('neutral', 2);
    expect(f.update(1000, 'player', 1)).toBe(0);
    expect(f.troops).toBe(2);
    expect(f.update(1000 + NODE_VIEW.ownerStableMs - 1, 'player', 3)).toBe(0);
    expect(f.update(1000 + NODE_VIEW.ownerStableMs, 'player', 3)).toBe(SHOWN_CHANGED | SHOWN_OWNER_CHANGED);
    expect(f.owner).toBe('player');
    expect(f.troops).toBe(3);
    expect(f.previousOwner).toBe('neutral');
  });

  it('a new owner that changes again restarts the wait', () => {
    const f = filter('neutral', 2);
    f.update(0, 'player', 1);
    f.update(200, 'enemy', 1);
    expect(f.update(400, 'enemy', 1)).toBe(0);
    expect(f.update(500, 'enemy', 1) & SHOWN_OWNER_CHANGED).toBe(SHOWN_OWNER_CHANGED);
    expect(f.owner).toBe('enemy');
  });
});
