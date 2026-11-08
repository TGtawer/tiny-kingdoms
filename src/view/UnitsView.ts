import type * as Phaser from 'phaser';
import { ARMY, STREAM, TICK_MS } from '../config/balance';
import { COLORS, STEP_FX, UNITS_FX } from '../config/game';
import type { Lane, Owner, World } from '../core/sim/World';
import { px, type FieldLayout, type Point } from './layout';

const OWNERS: readonly Owner[] = ['player', 'enemy', 'enemy2', 'neutral'];
/** Walk frames per side (docs/FX.md FX-4): round, middle, stretched. */
const STEP_FRAMES = 3;
/** Atlas frame name of each side's walk frame k: index OWNER_INDEX[owner] * STEP_FRAMES + k. */
const FRAME_NAMES: readonly string[] = OWNERS.flatMap((owner) => [owner, `${owner}-1`, `${owner}-2`]);
const OWNER_INDEX: Record<Owner, number> = { player: 0, enemy: 1, enemy2: 2, neutral: 3 };
/** Phase of the step per field unit walked: π per step, STEP_FX.stepsPerSec steps per second at ARMY.speed. */
const STEP_PHASE = (Math.PI * STEP_FX.stepsPerSec) / ARMY.speed;
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
 * speed, so one tick ago it was `TICK_STEP` behind on its road (clamped at the road's entry). A road is drawn from
 * circle to circle, so the simulation's part of it [startP, endP] is stretched onto the visible part.
 */
export class UnitsView {
  private readonly blitter: Phaser.GameObjects.Blitter;
  private readonly bobs: Phaser.GameObjects.Bob[] = [];
  /** Atlas frame shown by each pool figure (an index into FRAME_NAMES; setFrame only when it changes). */
  private readonly bobFrame: number[] = [];
  private used = 0;
  private half = 0;
  /** Hop height for this layout, game px. */
  private hop = 0;
  private readonly at: Point = { x: 0, y: 0 };
  /** Per lane: start x, y and end x, y of its visible part on screen. */
  private laneGeo = new Float64Array(0);

  /** `fx`: the walk of docs/FX.md (off with the dev flag `?perf=nofx`). */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx = true,
  ) {
    this.blitter = scene.add.blitter(0, 0, '__DEFAULT');
  }

  /** Figure radius for this layout: a share of the column step on screen, so neighbours never merge into a line. */
  static radius(field: FieldLayout): number {
    const step = (ARMY.speed / (STREAM.releasePerSec * STREAM.width)) * field.scale;
    return Math.min(px(UNITS_FX.maxRadiusPx), Math.max(px(UNITS_FX.minRadiusPx), step * UNITS_FX.radiusOfStep));
  }

  /**
   * Bakes the figures for the layout's size (once per size) and points every pool figure at the new frames. Each side
   * has three walk frames (FX-4): round, middle and stretched, all standing on the same feet; the cell is tall enough
   * for the stretched one, the round one sits at its center as before.
   */
  layout(field: FieldLayout): void {
    const r = Math.round(UnitsView.radius(field) * 2) / 2;
    const cell = Math.ceil(r * 2 * STEP_FX.stretch.h + 2);
    const key = `units-${r}`;
    if (!this.scene.textures.exists(key)) {
      const g = this.scene.make.graphics({}, false);
      const shapes = [{ w: 1, h: 1 }, STEP_FX.mid, STEP_FX.stretch];
      FRAME_NAMES.forEach((_, i) => {
        const owner = OWNERS[Math.floor(i / STEP_FRAMES)]!;
        const { w, h } = shapes[i % STEP_FRAMES]!;
        const cx = i * cell + cell / 2;
        // Feet at the round figure's bottom; a stretched figure grows upwards.
        const cy = cell / 2 + r - r * h;
        // Dark rim, the face a bit higher inside it (as on the nodes), no outline: tiny figures stay crisp.
        g.fillStyle(COLORS.factionDark[owner], 1).fillEllipse(cx, cy, 2 * r * w, 2 * r * h);
        g.fillStyle(COLORS.faction[owner], 1).fillEllipse(cx, cy - r * h * 0.18, 2 * r * w * 0.78, 2 * r * h * 0.78);
      });
      g.generateTexture(key, cell * FRAME_NAMES.length, cell);
      g.destroy();
      const texture = this.scene.textures.get(key);
      FRAME_NAMES.forEach((name, i) => texture.add(name, 0, i * cell, 0, cell, cell));
    }
    this.half = cell / 2;
    this.hop = this.fx ? r * STEP_FX.hopOfRadius : 0;
    this.blitter.setTexture(key);
    for (let i = 0; i < this.bobs.length; i++) this.bobs[i]!.setFrame(FRAME_NAMES[this.bobFrame[i]!]!);
  }

  setDepth(depth: number): this {
    this.blitter.setDepth(depth);
    return this;
  }

  /**
   * Screen geometry of every lane's visible part, recomputed each frame (a few dozen lanes; node sizes can change):
   * from just under the edge of the start circle (a unit appears hidden and comes out at once) to the edge of the
   * target circle (where it arrives). The simulation's [startP, endP] maps onto it.
   */
  private updateLanes(world: World, field: FieldLayout): void {
    const lanes = world.lanes;
    if (this.laneGeo.length < lanes.length * 4) this.laneGeo = new Float64Array(lanes.length * 4);
    const g = this.laneGeo;
    const a = this.at;
    for (let l = 0; l < lanes.length; l++) {
      const lane = lanes[l]!;
      if (lane.portal) continue;
      const from = world.nodes[lane.from]!;
      const to = world.nodes[lane.to]!;
      field.toScreenInto(from.x, from.y, a);
      const ax = a.x;
      const ay = a.y;
      field.toScreenInto(to.x, to.y, a);
      const dx = a.x - ax;
      const dy = a.y - ay;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const ra = Math.max(0, field.nodeRadius(from.size) - this.half);
      const rb = field.nodeRadius(to.size);
      g[l * 4] = ax + ux * ra;
      g[l * 4 + 1] = ay + uy * ra;
      g[l * 4 + 2] = a.x - ux * rb;
      g[l * 4 + 3] = a.y - uy * rb;
    }
  }

  /** Screen point of `progress` on lane `l` (between the circles), using the geometry of this frame. */
  private place(lane: Lane, l: number, progress: number, out: Point): Point {
    const g = this.laneGeo;
    const span = lane.endP - lane.startP;
    const t = span > 0 ? Math.min(1, Math.max(0, (progress - lane.startP) / span)) : 0;
    out.x = g[l * 4]! + (g[l * 4 + 2]! - g[l * 4]!) * t;
    out.y = g[l * 4 + 1]! + (g[l * 4 + 3]! - g[l * 4 + 1]!) * t;
    return out;
  }

  /** Screen point of a spot on a road (e.g. a clash), mapped like the units. */
  screenAt(world: World, field: FieldLayout, l: number, progress: number, out: Point): Point {
    this.updateLanes(world, field);
    return this.place(world.lanes[l]!, l, progress, out);
  }

  /** Places every unit for this frame; `alpha` is the share of the current tick that has passed (0..1). */
  render(world: World, field: FieldLayout, alpha: number): void {
    this.updateLanes(world, field);
    const back = 1 - alpha;
    let n = 0;
    const units = world.units;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]!;
      const l = unit.route.lanes[0]!;
      const lane = world.lanes[l]!;
      // Inside a portal a unit is invisible.
      if (lane.portal) continue;
      // One tick ago the unit was one tick of walking behind (never before the road's entry).
      const p = Math.max(lane.startP, unit.progress - (back * TICK_STEP) / lane.length);
      this.place(lane, l, p, this.at);

      // Walk (FX-4): a hop per step and a frame by its height; no memory, from the distance walked on this road.
      let lift = 0;
      let frame = OWNER_INDEX[unit.owner] * STEP_FRAMES;
      if (this.fx) {
        lift = Math.abs(Math.sin((p - lane.startP) * lane.length * STEP_PHASE + unit.id));
        frame += lift < STEP_FX.midFrom ? 0 : lift < STEP_FX.stretchFrom ? 1 : 2;
      }
      let bob = this.bobs[n];
      if (!bob) {
        bob = this.blitter.create(0, 0, FRAME_NAMES[frame]);
        this.bobs.push(bob);
        this.bobFrame.push(frame);
      } else if (this.bobFrame[n] !== frame) {
        bob.setFrame(FRAME_NAMES[frame]!);
        this.bobFrame[n] = frame;
      }
      bob.x = this.at.x - this.half;
      bob.y = this.at.y - this.half - this.hop * lift;
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
