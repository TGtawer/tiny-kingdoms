import type { Owner } from '../core/sim/World';

/** `update` result bits. */
export const SHOWN_CHANGED = 1;
export const SHOWN_OWNER_CHANGED = 2;

/**
 * What a node shows while units pour in (docs/PLAYTEST-1.md F-2). Pure, no Phaser, no allocations per call.
 * - Rate: the shown state changes at most once per `refreshMs`. After a quiet spell a change shows at once;
 *   while the node keeps changing, the latest value shows at the end of each window.
 * - Owner: a capture after a quiet spell (the real owner had not changed for `ownerStableMs`) shows at once,
 *   skipping the rate window. Only a ping-pong (the owner changes again sooner than that) waits: the new owner
 *   shows once it held for `ownerStableMs` in a row; until then the old owner stays and the count freezes at its
 *   last shown value, so a 0 ↔ 1 ping-pong never blinks the color.
 */
export class DisplayFilter {
  /** Shown owner and count. */
  owner: Owner;
  troops: number;
  /** The owner shown before the last owner change (for capture effects). */
  previousOwner: Owner;
  private lastChangeAt = -Infinity;
  /** The real owner last fed in, and when it last changed. */
  private realOwner: Owner;
  private realOwnerChangedAt = -Infinity;

  constructor(
    owner: Owner,
    troops: number,
    private readonly refreshMs: number,
    private readonly ownerStableMs: number,
  ) {
    this.owner = owner;
    this.troops = troops;
    this.previousOwner = owner;
    this.realOwner = owner;
  }

  /** Feeds the real state at `now` (ms); returns SHOWN_* bits of what changed on screen. */
  update(now: number, owner: Owner, troops: number): number {
    // A real owner change after a quiet spell is a plain capture; one sooner than that is a ping-pong.
    let quietCapture = false;
    if (owner !== this.realOwner) {
      quietCapture = now - this.realOwnerChangedAt >= this.ownerStableMs;
      this.realOwner = owner;
      this.realOwnerChangedAt = now;
    }
    let nextOwner = this.owner;
    let nextTroops = troops;
    if (owner !== this.owner) {
      if (quietCapture || now - this.realOwnerChangedAt >= this.ownerStableMs) nextOwner = owner;
      else nextTroops = this.troops;
    }
    if (nextOwner === this.owner && nextTroops === this.troops) return 0;
    // An owner change shows at once; only count changes are rate-limited.
    if (nextOwner === this.owner && now - this.lastChangeAt < this.refreshMs) return 0;

    this.lastChangeAt = now;
    this.troops = nextTroops;
    if (nextOwner === this.owner) return SHOWN_CHANGED;
    this.previousOwner = this.owner;
    this.owner = nextOwner;
    return SHOWN_CHANGED | SHOWN_OWNER_CHANGED;
  }

  /** Shows the real state at once (layout rebuilt, level start). */
  reset(owner: Owner, troops: number): void {
    this.owner = owner;
    this.troops = troops;
    this.previousOwner = owner;
    this.realOwner = owner;
    this.realOwnerChangedAt = -Infinity;
    this.lastChangeAt = -Infinity;
  }
}
