import type * as Phaser from 'phaser';
import { COLORS, MENU_FX } from '../config/game';
import { px } from './layout';

const SHADOW_KEY = 'menu-cloud-shadow';

interface Shadow {
  sprite: Phaser.GameObjects.Image;
  /** Position as a share of the screen, so a resize keeps the layout. */
  x: number;
  y: number;
  speed: number;
}

interface Flight {
  startMs: number;
  y: number;
  dir: 1 | -1;
}

/**
 * Quiet menu life above the backdrop battle (docs/VISUALS.md V-1.3, V-1.4): soft cloud shadows drifting
 * right and an occasional pair of birds. The shadow is drawn once into a texture and moved as sprites;
 * the birds are a few lines redrawn only while they fly.
 */
export class MenuAmbient {
  private readonly shadows: Shadow[] = [];
  private readonly birds: Phaser.GameObjects.Graphics | null;
  private flight: Flight | null = null;
  private nextFlightMs: number;
  private width: number;
  private height: number;

  constructor(scene: Phaser.Scene, depth: number) {
    this.width = scene.scale.width;
    this.height = scene.scale.height;
    if (MENU_FX.showCloudShadows) {
      const key = shadowTexture(scene);
      for (const item of MENU_FX.cloudShadows.items) {
        const sprite = scene.add.image(0, 0, key).setDepth(depth).setAlpha(MENU_FX.cloudShadows.alpha).setScale(item.scale);
        this.shadows.push({ sprite, x: item.x, y: item.y, speed: item.speed });
      }
      this.placeShadows();
    }
    this.birds = MENU_FX.showBirds ? scene.add.graphics().setDepth(depth + 1) : null;
    this.nextFlightMs = scene.time.now + MENU_FX.birds.minGapMs / 3;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.placeShadows();
  }

  update(time: number, delta: number): void {
    for (const s of this.shadows) {
      s.x += (px(s.speed) * delta) / 1000 / this.width;
      // Fully past the right edge: come back from the left.
      const half = s.sprite.displayWidth / 2 / this.width;
      if (s.x - half > 1) s.x = -half;
      s.sprite.x = s.x * this.width;
    }
    this.updateBirds(time);
  }

  destroy(): void {
    for (const s of this.shadows) s.sprite.destroy();
    this.shadows.length = 0;
    this.birds?.destroy();
  }

  private placeShadows(): void {
    for (const s of this.shadows) s.sprite.setPosition(s.x * this.width, s.y * this.height);
  }

  private updateBirds(time: number): void {
    const g = this.birds;
    if (!g) return;
    const fx = MENU_FX.birds;
    if (!this.flight && time >= this.nextFlightMs) {
      this.flight = { startMs: time, y: px(fx.bandTop) + Math.random() * px(fx.bandHeight), dir: Math.random() < 0.5 ? 1 : -1 };
    }
    if (!this.flight) return;
    g.clear();
    const { startMs, y, dir } = this.flight;
    const k = (time - startMs) / fx.flightMs;
    if (k >= 1) {
      this.flight = null;
      this.nextFlightMs = time + fx.minGapMs + Math.random() * (fx.maxGapMs - fx.minGapMs);
      return;
    }
    const margin = px(30);
    const x = dir > 0 ? -margin + k * (this.width + margin * 2) : this.width + margin - k * (this.width + margin * 2);
    const sec = time / 1000;
    g.lineStyle(px(fx.lineWidth), COLORS.outline, 1);
    for (const [ox, oy, phase] of [
      [0, 0, 0],
      [-px(fx.followX) * dir, px(fx.followY), fx.followPhase],
    ] as const) {
      const bx = x + ox;
      const by = y + oy;
      const flap = Math.sin((sec + phase) * fx.flapSpeed) * px(fx.flapAmp);
      const wing = px(fx.wing);
      // Each wing: tip → elbow → body, a "check mark" that flaps at the tips.
      for (const side of [-1, 1]) {
        g.lineBetween(bx + side * wing, by - flap, bx + side * wing * 0.43, by - px(2));
        g.lineBetween(bx + side * wing * 0.43, by - px(2), bx, by + px(1));
      }
    }
  }
}

/** The cloud shadow blob, drawn once per device pixel ratio. */
function shadowTexture(scene: Phaser.Scene): string {
  const fx = MENU_FX.cloudShadows;
  const key = `${SHADOW_KEY}-${px(1)}`;
  if (scene.textures.exists(key)) return key;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [dx, dy, r] of fx.blobs) {
    minX = Math.min(minX, dx - r);
    maxX = Math.max(maxX, dx + r);
    minY = Math.min(minY, dy - r * fx.flatten);
    maxY = Math.max(maxY, dy + r * fx.flatten);
  }
  const g = scene.make.graphics({}, false);
  g.fillStyle(fx.color, 1);
  for (const [dx, dy, r] of fx.blobs) g.fillEllipse(px(dx - minX), px(dy - minY), px(r * 2), px(r * 2 * fx.flatten));
  g.generateTexture(key, Math.ceil(px(maxX - minX)), Math.ceil(px(maxY - minY)));
  g.destroy();
  return key;
}
