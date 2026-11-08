import type * as Phaser from 'phaser';
import { COLORS, TOWER_SHOT } from '../config/game';
import type { Owner } from '../core/sim/World';
import { px, type Point } from './layout';
import type { UnitsView } from './UnitsView';

const FLASH_KEY = 'tower-shot-flash';

/**
 * Tower shots on screen (docs/TOWER.md TW-4, effect «Стрела» of the prototype): an arrow flies from the tower badge
 * to the shot unit in TOWER_SHOT.flightMs along a low arc, then a fire flash where it died. The simulation removes
 * the unit at once; its figure walks on as a ghost (UnitsView.addGhost) until the arrow reaches it, and the arrow
 * homes on the ghost, so it hits whatever the battle speed.
 * Everything is pooled (TOWER_SHOT.pool slots, made with the scene): one Graphics for all arrows, drawn only while
 * an arrow flies, and one Image per slot for the flashes. Animated by hand from the scene time, no tweens.
 */
export class TowerShotView {
  private readonly arrows: Phaser.GameObjects.Graphics;
  private readonly flashes: Phaser.GameObjects.Image[] = [];
  /** Per slot: when the arrow left (-Infinity: free), where from, its ghost; when the flash started. */
  private readonly shotAt = new Float64Array(TOWER_SHOT.pool).fill(-Infinity);
  private readonly fromX = new Float64Array(TOWER_SHOT.pool);
  private readonly fromY = new Float64Array(TOWER_SHOT.pool);
  private readonly ghost = new Int32Array(TOWER_SHOT.pool).fill(-1);
  /** Last point of the ghost (the flash goes there when the arrow lands). */
  private readonly toX = new Float64Array(TOWER_SHOT.pool);
  private readonly toY = new Float64Array(TOWER_SHOT.pool);
  private readonly flashAt = new Float64Array(TOWER_SHOT.pool).fill(-Infinity);
  private readonly point: Point = { x: 0, y: 0 };
  private drawn = false;

  constructor(
    scene: Phaser.Scene,
    depth: number,
    private readonly units: UnitsView,
  ) {
    this.arrows = scene.add.graphics().setDepth(depth).setVisible(false);
    const r = px(TOWER_SHOT.flashToPx);
    const size = Math.ceil(r * 2 + 2);
    const key = `${FLASH_KEY}-${size}`;
    if (!scene.textures.exists(key)) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(COLORS.fireball, TOWER_SHOT.flashAlpha).fillCircle(size / 2, size / 2, r);
      g.fillStyle(TOWER_SHOT.core, 1).fillCircle(size / 2, size / 2, r / 2);
      g.generateTexture(key, size, size);
      g.destroy();
    }
    for (let i = 0; i < TOWER_SHOT.pool; i++) this.flashes.push(scene.add.image(0, 0, key).setDepth(depth).setVisible(false));
  }

  /**
   * A tower at (x, y) — its badge — shot unit `unitId` of `owner` at `progress` of lane l during tick `tick`.
   * Skipped when every slot is busy.
   */
  shoot(x: number, y: number, owner: Owner, unitId: number, l: number, progress: number, tick: number, now: number): void {
    for (let i = 0; i < TOWER_SHOT.pool; i++) {
      if (this.shotAt[i] !== -Infinity || this.flashAt[i] !== -Infinity) continue;
      this.shotAt[i] = now;
      this.fromX[i] = x;
      this.fromY[i] = y;
      this.toX[i] = x;
      this.toY[i] = y;
      this.ghost[i] = this.units.addGhost(owner, unitId, l, progress, tick);
      return;
    }
  }

  /** Call after the units were drawn this frame (the ghosts' points are fresh). */
  update(now: number): void {
    const g = this.arrows;
    let drawing = false;
    for (let i = 0; i < TOWER_SHOT.pool; i++) {
      if (this.shotAt[i] !== -Infinity) {
        if (this.units.ghostPoint(this.ghost[i]!, this.point)) {
          this.toX[i] = this.point.x;
          this.toY[i] = this.point.y;
        }
        const k = (now - this.shotAt[i]!) / TOWER_SHOT.flightMs;
        if (k >= 1) {
          // Landed: the ghost goes, the flash starts where it was.
          this.units.removeGhost(this.ghost[i]!);
          this.ghost[i] = -1;
          this.shotAt[i] = -Infinity;
          this.flashAt[i] = now;
          this.flashes[i]!.setPosition(this.toX[i]!, this.toY[i]!);
        } else {
          if (!drawing) {
            g.clear();
            drawing = true;
          }
          this.drawArrow(i, Math.max(0, k));
        }
      }
      const flash = this.flashes[i]!;
      if (this.flashAt[i] === -Infinity) continue;
      const t = (now - this.flashAt[i]!) / TOWER_SHOT.flashMs;
      if (t >= 1) {
        flash.setVisible(false);
        this.flashAt[i] = -Infinity;
        continue;
      }
      const from = TOWER_SHOT.flashFromPx / TOWER_SHOT.flashToPx;
      flash.setVisible(true).setScale(from + (1 - from) * t).setAlpha(1 - t);
    }
    if (drawing) {
      g.setVisible(true);
      this.drawn = true;
    } else if (this.drawn) {
      g.clear().setVisible(false);
      this.drawn = false;
    }
  }

  /** Arrow i at share k of its flight: the head at k along the arc, the tail lengthShare behind it. */
  private drawArrow(i: number, k: number): void {
    const g = this.arrows;
    const ax = this.fromX[i]!;
    const ay = this.fromY[i]!;
    const dx = this.toX[i]! - ax;
    const dy = this.toY[i]! - ay;
    const lift = px(TOWER_SHOT.liftPx);
    const k2 = Math.max(0, k - TOWER_SHOT.lengthShare);
    const hx = ax + dx * k;
    const hy = ay + dy * k - Math.sin(k * Math.PI) * lift;
    const tx = ax + dx * k2;
    const ty = ay + dy * k2 - Math.sin(k2 * Math.PI) * lift;
    line(g, tx, ty, hx, hy, px(TOWER_SHOT.outlinePx), COLORS.outline);
    line(g, tx, ty, hx, hy, px(TOWER_SHOT.corePx), TOWER_SHOT.core);
  }
}

/** A line with round ends. */
function line(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, width: number, color: number): void {
  g.lineStyle(width, color, 1).lineBetween(x0, y0, x1, y1);
  g.fillStyle(color, 1).fillCircle(x0, y0, width / 2).fillCircle(x1, y1, width / 2);
}
