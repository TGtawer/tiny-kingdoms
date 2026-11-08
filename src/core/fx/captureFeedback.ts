/**
 * Camera shake and hit-stop on a capture by the player (docs/FX.md FX-8). Pure: no Phaser, no allocations.
 * Times are real (scene) ms; the caller remembers when the last shake / hit-stop happened and when the player lost
 * the node.
 */

export type ShakeKind = 'none' | 'normal' | 'capital';

export interface CaptureFeedback {
  shake: ShakeKind;
  hitStop: boolean;
}

export interface CaptureFeedbackParams {
  /** A normal shake waits this long after the previous one (an enemy capital ignores it). */
  shakeCooldownMs: number;
  /** A hit-stop waits this long after the previous one. */
  hitStopEveryMs: number;
  /** No hit-stop when the player lost this node less than this long ago (the node changes hands back and forth). */
  hitStopAfterLossMs: number;
}

export interface CaptureContext {
  now: number;
  /** An enemy capital was captured. */
  enemyCapital: boolean;
  /** When the player last lost this node (-Infinity: never). */
  lostAt: number;
  lastShakeAt: number;
  lastHitStopAt: number;
  /** The player is choosing (a tutorial step, the build menu, a swipe, a spell target): the battle is slowed anyway. */
  choosing: boolean;
  /** The battle is over (the last capture plays the victory wave instead). */
  over: boolean;
}

/** Writes the decision into `out` and returns it. */
export function captureFeedback(ctx: CaptureContext, params: CaptureFeedbackParams, out: CaptureFeedback): CaptureFeedback {
  if (ctx.enemyCapital) out.shake = 'capital';
  else out.shake = ctx.now - ctx.lastShakeAt >= params.shakeCooldownMs ? 'normal' : 'none';
  out.hitStop =
    !ctx.over &&
    !ctx.choosing &&
    ctx.now - ctx.lastHitStopAt >= params.hitStopEveryMs &&
    ctx.now - ctx.lostAt >= params.hitStopAfterLossMs;
  return out;
}
