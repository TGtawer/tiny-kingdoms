import { describe, expect, it } from 'vitest';
import { captureFeedback, type CaptureContext, type CaptureFeedback } from '../../../src/core/fx/captureFeedback';

const params = { shakeCooldownMs: 1000, hitStopEveryMs: 3000, hitStopAfterLossMs: 5000 };

function decide(ctx: Partial<CaptureContext>): CaptureFeedback {
  const full: CaptureContext = {
    now: 10_000,
    enemyCapital: false,
    lostAt: -Infinity,
    lastShakeAt: -Infinity,
    lastHitStopAt: -Infinity,
    choosing: false,
    over: false,
    ...ctx,
  };
  return captureFeedback(full, params, { shake: 'none', hitStop: false });
}

describe('captureFeedback (FX-8)', () => {
  it('a plain capture shakes and stops the frame', () => {
    expect(decide({})).toEqual({ shake: 'normal', hitStop: true });
  });

  it('a normal shake waits for its cooldown', () => {
    expect(decide({ lastShakeAt: 9_500 }).shake).toBe('none');
    expect(decide({ lastShakeAt: 9_000 }).shake).toBe('normal');
  });

  it('an enemy capital shakes harder and ignores the cooldown', () => {
    expect(decide({ enemyCapital: true }).shake).toBe('capital');
    expect(decide({ enemyCapital: true, lastShakeAt: 9_900 }).shake).toBe('capital');
  });

  it('a re-capture of an own lost node still shakes', () => {
    expect(decide({ lostAt: 9_000 }).shake).toBe('normal');
  });

  it('hit-stop waits 3 s after the previous one', () => {
    expect(decide({ lastHitStopAt: 7_500 }).hitStop).toBe(false);
    expect(decide({ lastHitStopAt: 7_000 }).hitStop).toBe(true);
  });

  it('no hit-stop on a node the player lost less than 5 s ago', () => {
    expect(decide({ lostAt: 6_000 }).hitStop).toBe(false);
    expect(decide({ lostAt: 5_000 }).hitStop).toBe(true);
  });

  it('no hit-stop while the player is choosing', () => {
    expect(decide({ choosing: true })).toEqual({ shake: 'normal', hitStop: false });
  });

  it('no hit-stop once the battle is over; the shake stays', () => {
    expect(decide({ over: true, enemyCapital: true })).toEqual({ shake: 'capital', hitStop: false });
  });

  it('three quick captures give one hit-stop', () => {
    let lastHitStopAt = -Infinity;
    let stops = 0;
    for (const now of [10_000, 10_400, 10_900]) {
      if (decide({ now, lastHitStopAt }).hitStop) {
        stops++;
        lastHitStopAt = now;
      }
    }
    expect(stops).toBe(1);
  });
});
