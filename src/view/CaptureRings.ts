import type * as Phaser from 'phaser';
import { CAPTURE_FX } from '../config/game';
import { px } from './layout';

/** Ease-out cubic. */
export function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

/**
 * The two rings of a capture by the player (docs/FX.md FX-7) from a fixed pool of images, animated by hand in
 * `update` (no tweens, nothing created in battle). Each ring's texture is baked at its final size per node radius
 * (`layout`, at layout time); it grows from the node's rim by scaling up, so its line thickens to the full width.
 */
export class CaptureRings {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly startedAt: number[] = [];
  /** Which ring of CAPTURE_FX.rings each image plays, and its scale at the start. */
  private readonly kind: number[] = [];
  private readonly fromScale: number[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
  ) {
    for (let i = 0; i < CAPTURE_FX.ringPool; i++) {
      this.images.push(scene.add.image(0, 0, '__WHITE').setDepth(depth).setVisible(false));
      this.startedAt.push(-Infinity);
      this.kind.push(0);
      this.fromScale.push(1);
    }
  }

  /** Bakes the ring textures for every node radius on the field (once per size). */
  layout(radii: readonly number[]): void {
    for (const r of radii) {
      CAPTURE_FX.rings.forEach((_, k) => {
        const key = ringKey(k, r);
        if (this.scene.textures.exists(key)) return;
        const ring = CAPTURE_FX.rings[k]!;
        const width = px(ring.widthPx);
        const outer = Math.round(r) + px(ring.growPx);
        const size = Math.ceil(outer * 2 + 2);
        const g = this.scene.make.graphics({}, false);
        g.lineStyle(width, 0xffffff, 1).strokeCircle(size / 2, size / 2, outer - width / 2);
        g.generateTexture(key, size, size);
        g.destroy();
      });
    }
  }

  /** Both rings around a node of radius r at (x, y), colored `color`. Skipped when the pool is busy. */
  play(x: number, y: number, r: number, color: number, now: number): void {
    for (let k = 0; k < CAPTURE_FX.rings.length; k++) {
      const i = this.free(now);
      if (i < 0) return;
      const ring = CAPTURE_FX.rings[k]!;
      this.startedAt[i] = now + ring.delayMs;
      this.kind[i] = k;
      this.fromScale[i] = Math.round(r) / (Math.round(r) + px(ring.growPx));
      this.images[i]!.setTexture(ringKey(k, r)).setPosition(x, y).setTint(color).setScale(this.fromScale[i]!).setAlpha(1).setVisible(false);
    }
  }

  update(now: number): void {
    for (let i = 0; i < this.images.length; i++) {
      const start = this.startedAt[i]!;
      if (start === -Infinity) continue;
      const image = this.images[i]!;
      const t = (now - start) / CAPTURE_FX.rings[this.kind[i]!]!.ms;
      if (t < 0) continue;
      if (t >= 1) {
        image.setVisible(false);
        this.startedAt[i] = -Infinity;
        continue;
      }
      const from = this.fromScale[i]!;
      image
        .setVisible(true)
        .setScale(from + (1 - from) * easeOutCubic(t))
        .setAlpha(1 - t);
    }
  }

  private free(now: number): number {
    for (let i = 0; i < this.images.length; i++) {
      if (this.startedAt[i] === -Infinity || now - this.startedAt[i]! >= CAPTURE_FX.rings[this.kind[i]!]!.ms) return i;
    }
    return -1;
  }
}

function ringKey(k: number, r: number): string {
  return `capture-ring-${k}-${Math.round(r)}`;
}
