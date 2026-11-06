import type { Owner } from '../core/sim/World';

/** `update` result bits. */
export const SHOWN_CHANGED = 1;
export const SHOWN_OWNER_CHANGED = 2;

/**
 * What a node shows while units pour in (docs/PLAYTEST-1.md F-2). Pure, no Phaser, no allocations per call.
 * - Rate: the shown state changes at most once per `refreshMs`. After a quiet spell a change shows at once;
 *   while the node keeps changing, the latest value shows at the end of each window.
 * - Owner: a new owner shows only after it held for `ownerStableMs` in a row. Until then the old owner stays
 *   and the count freezes at its last shown value (a 0 ↔ 1 ping-pong never blinks the color).
 */
export class DisplayFilter {
  /** Shown owner and count. */
  owner: Owner;
  troops: number;
  /** The owner shown before the last owner change (for capture effects). */
  previousOwner: Owner;
  private lastChangeAt = -Infinity;
  private pendingOwner: Owner;
  private pendingSince = 0;

  constructor(
    owner: Owner,
    troops: number,
    private readonly refreshMs: number,
    private readonly ownerStableMs: number,
  ) {
    this.owner = owner;
    this.troops = troops;
    this.previousOwner = owner;
    this.pendingOwner = owner;
  }

  /** Feeds the real state at `now` (ms); returns SHOWN_* bits of what changed on screen. */
  update(now: number, owner: Owner, troops: number): number {
    let nextOwner = this.owner;
    let nextTroops = troops;
    if (owner !== this.owner) {
      if (owner !== this.pendingOwner) {
        this.pendingOwner = owner;
        this.pendingSince = now;
      }
      if (now - this.pendingSince >= this.ownerStableMs) nextOwner = owner;
      else nextTroops = this.troops;
    } else {
      this.pendingOwner = owner;
    }
    if (nextOwner === this.owner && nextTroops === this.troops) return 0;
    if (now - this.lastChangeAt < this.refreshMs) return 0;

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
    this.pendingOwner = owner;
    this.lastChangeAt = -Infinity;
  }
}
