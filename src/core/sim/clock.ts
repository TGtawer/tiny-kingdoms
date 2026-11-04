import { SLOW_MO, TICK_MS } from '../../config/balance';

/**
 * Simulation speed for this moment of the battle. While the player is choosing something (a tutorial step waits
 * for them, the build menu is open, a swipe is being drawn, a spell waits for its target) the whole battle,
 * armies on the road included, runs at SLOW_MO.speed; the speed-up does not apply then. Otherwise the speed-up
 * multiplier (1 = normal).
 */
export function battleSpeed(speedUp: number, slowed: boolean): number {
  return slowed ? SLOW_MO.speed : speedUp;
}

/**
 * Fixed-step clock for one frame of `deltaMs` real time. `speed()` is read before every tick, so a slow-down
 * that ends mid-frame speeds the rest of the frame up at once. `tick()` returns false to stop (battle over).
 * Returns the new accumulator (simulation ms towards the next tick).
 */
export function runClock(accumulatorMs: number, deltaMs: number, speed: () => number, tick: () => boolean): number {
  let acc = accumulatorMs;
  let left = deltaMs;
  for (;;) {
    const s = speed();
    // Real ms until the next tick at the current speed.
    const need = (TICK_MS - acc) / s;
    // The epsilon absorbs float noise from frame deltas such as 1000 / 60.
    if (left < need - 1e-6) return acc + left * s;
    left = Math.max(0, left - need);
    acc = 0;
    if (!tick()) return 0;
  }
}
