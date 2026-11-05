import type * as Phaser from 'phaser';
import { ARMY, STREAM, TICK_MS } from '../config/balance';
import { COLORS, UNITS_FX } from '../config/game';
import type { Owner, World } from '../core/sim/World';
import { px, type FieldLayout, type Point } from './layout';

const OWNERS: readonly Owner[] = ['player', 'enemy', 'enemy2', 'neutral'];
/** Off-screen spot for pool figures that are not in use (keeps the Blitter's render list unchanged). */
const PARKED = -10000;
/** Distance a unit walks in one tick, field units: the interpolation step. */
const TICK_STEP = (ARMY.speed * TICK_MS) / 1000;

/**
 * All units on the field in one batch (ARCHITECTURE.md «Производительность»): a Blitter with one baked texture
 * holding a figure per side, one draw call. Pool figures are created only when the field holds more units than
 * ever before, never destroyed in battle; unused ones are parked off-screen. No Text, no Graphics per unit.
 *
 * Positions are interpolated between ticks without any memory of the previous tick: every unit walks at the same
 * speed, so one tick ago it was `TICK_STEP` behind on its current road (clamped at the road start, under the node).
 */
export class UnitsView {
  private readonly blitter: Phaser.GameObjects.Blitter;
  private readonly bobs: Phaser.GameObjects.Bob[] = [];
  /** Owner shown by each pool figure (frame changes only when it changes). */
  private readonly bobOwner: Array<Owner | null> = [];
  private used = 0;
  private half = 0;
  private readonly at: Point = { x: 0, y: 0 };

  constructor(private readonly scene: Phaser.Scene) {
    this.blitter = scene.add.blitter(0, 0, '__DEFAULT');
  }

  /** Figure radius for this layout: a share of the column step on screen, so neighbours never merge into a line. */
  static radius(field: FieldLayout): number {
    const step = (ARMY.speed / (STREAM.releasePerSec * STREAM.width)) * field.scale;
    return Math.min(px(UNITS_FX.maxRadiusPx), Math.max(px(UNITS_FX.minRadiusPx), step * UNITS_FX.radiusOfStep));
  }

  /** Bakes the figures for the layout's size (once per size) and points every pool figure at the new frames. */
  layout(field: FieldLayout): void {
    const r = Math.round(UnitsView.radius(field) * 2) / 2;
    const cell = Math.ceil(r * 2 + 2);
    const key = `units-${r}`;
    if (!this.scene.textures.exists(key)) {
      const g = this.scene.make.graphics({}, false);
      OWNERS.forEach((owner, i) => {
        const cx = i * cell + cell / 2;
        const cy = cell / 2;
        // Dark rim, the face a bit higher inside it (as on the nodes), no outline: tiny figures stay crisp.
        g.fillStyle(COLORS.factionDark[owner], 1).fillCircle(cx, cy, r);
        g.fillStyle(COLORS.faction[owner], 1).fillCircle(cx, cy - r * 0.18, r * 0.78);
      });
      g.generateTexture(key, cell * OWNERS.length, cell);
      g.destroy();
      const texture = this.scene.textures.get(key);
      OWNERS.forEach((owner, i) => texture.add(owner, 0, i * cell, 0, cell, cell));
    }
    this.half = cell / 2;
    this.blitter.setTexture(key);
    for (let i = 0; i < this.bobs.length; i++) {
      const owner = this.bobOwner[i];
      if (owner) this.bobs[i]!.setFrame(owner);
    }
  }

  setDepth(depth: number): this {
    this.blitter.setDepth(depth);
    return this;
  }

  /** Places every unit for this frame; `alpha` is the share of the current tick that has passed (0..1). */
  render(world: World, field: FieldLayout, alpha: number): void {
    const back = 1 - alpha;
    let n = 0;
    const units = world.units;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]!;
      const lane = world.lanes[unit.lanes[unit.segment]!]!;
      // Inside a portal a unit is invisible.
      if (lane.portal) continue;
      const a = world.nodes[lane.from]!;
      const b = world.nodes[lane.to]!;
      const t = Math.max(0, unit.progress - (back * TICK_STEP) / lane.length);
      field.toScreenInto(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, this.at);

      let bob = this.bobs[n];
      if (!bob) {
        bob = this.blitter.create(0, 0, unit.owner);
        this.bobs.push(bob);
        this.bobOwner.push(unit.owner);
      } else if (this.bobOwner[n] !== unit.owner) {
        bob.setFrame(unit.owner);
        this.bobOwner[n] = unit.owner;
      }
      bob.x = this.at.x - this.half;
      bob.y = this.at.y - this.half;
      n++;
    }
    for (let i = n; i < this.used; i++) {
      const bob = this.bobs[i]!;
      bob.x = PARKED;
      bob.y = PARKED;
    }
    this.used = n;
  }

  /** Pool figures ever created (for the dev counter). */
  get poolSize(): number {
    return this.bobs.length;
  }
}

/**
 * Short flashes (unit clashes, tower shots, trades at a node) from a fixed pool of images: at most
 * UNITS_FX.flashPool at once, and one per spot every UNITS_FX.flashEverySpotMs — a mass clash makes one flash at
 * the meeting point, not one per pair. Animated by hand in `update` (no tweens created in battle).
 */
export class FlashPool {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly startedAt: number[] = [];
  /** Last flash time per spot (numeric key of the spot cell). */
  private readonly lastAt = new Map<number, number>();
  private readonly spot: number;

  constructor(scene: Phaser.Scene, depth: number) {
    const r = px(UNITS_FX.flashRadiusPx);
    const size = Math.ceil(r * 2 + 4);
    const key = `unit-flash-${r}`;
    if (!scene.textures.exists(key)) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(0xffffff, 0.55).fillCircle(size / 2, size / 2, r);
      g.lineStyle(px(2), 0xffffff, 1).strokeCircle(size / 2, size / 2, r - px(1));
      g.generateTexture(key, size, size);
      g.destroy();
    }
    for (let i = 0; i < UNITS_FX.flashPool; i++) {
      this.images.push(scene.add.image(0, 0, key).setDepth(depth).setVisible(false));
      this.startedAt.push(-Infinity);
    }
    this.spot = px(UNITS_FX.flashSpotPx);
  }

  /** Starts a flash at a screen point, unless this spot flashed very recently or the pool is busy. */
  flash(x: number, y: number, color: number, now: number): boolean {
    const key = Math.round(x / this.spot) * 65536 + Math.round(y / this.spot);
    const last = this.lastAt.get(key);
    if (last !== undefined && now - last < UNITS_FX.flashEverySpotMs) return false;
    for (let i = 0; i < this.images.length; i++) {
      if (now - this.startedAt[i]! < UNITS_FX.flashMs) continue;
      this.lastAt.set(key, now);
      this.startedAt[i] = now;
      this.images[i]!.setPosition(x, y).setTint(color).setVisible(true).setScale(0.5).setAlpha(1);
      return true;
    }
    return false;
  }

  update(now: number): void {
    for (let i = 0; i < this.images.length; i++) {
      const image = this.images[i]!;
      if (!image.visible) continue;
      const t = (now - this.startedAt[i]!) / UNITS_FX.flashMs;
      if (t >= 1) {
        image.setVisible(false);
        continue;
      }
      image.setScale(0.5 + t * 0.9).setAlpha(1 - t);
    }
  }
}
