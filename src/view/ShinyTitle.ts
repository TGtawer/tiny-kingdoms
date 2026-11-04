import type * as Phaser from 'phaser';
import { COLORS, cssColor, FONT_FAMILY, MENU_FX } from '../config/game';
import { px } from './layout';

let nextKey = 0;

/**
 * Game title drawn into a canvas texture: outline, drop shadow, gold fill, and a light band that sweeps
 * across the letters (docs/VISUALS.md V-1.5). Phaser 4 masks are per-frame WebGL filters; a canvas with
 * 'source-atop' clips the band to the letters for free, and the canvas is redrawn only while the band moves.
 */
export class ShinyTitle {
  readonly image: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly key = `menu-title-${nextKey++}`;
  private readonly width: number;
  private readonly height: number;
  private readonly font: string;
  private readonly stroke: number;
  private readonly shadow: number;
  private shining = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly text: string,
    sizeCss: number,
    strokeCss: number,
    shadowCss: number,
  ) {
    this.font = `bold ${px(sizeCss)}px ${FONT_FAMILY}`;
    this.stroke = px(strokeCss);
    this.shadow = px(shadowCss);
    const measure = document.createElement('canvas').getContext('2d')!;
    measure.font = this.font;
    // Room for the outline on all sides and the shadow below (descenders of y and g included).
    this.width = Math.ceil(measure.measureText(text).width + this.stroke * 2);
    this.height = Math.ceil(px(sizeCss) * 1.35 + this.stroke * 2 + this.shadow);
    this.texture = scene.textures.createCanvas(this.key, this.width, this.height)!;
    this.image = scene.add.image(0, 0, this.key);
    // Origin at the letters' middle, not the texture's (the shadow adds room below).
    this.image.setOrigin(0.5, (this.height - this.shadow) / 2 / this.height);
    this.draw(null);
  }

  /** Call every frame with the scene time; redraws only while the band is on the letters. */
  update(time: number): void {
    const { periodMs, durationMs } = MENU_FX.shine;
    const k = (time % periodMs) / durationMs;
    if (k < 1) {
      this.draw(k);
      this.shining = true;
    } else if (this.shining) {
      this.draw(null);
      this.shining = false;
    }
  }

  destroy(): void {
    this.image.destroy();
    this.scene.textures.remove(this.key);
  }

  /** `shine`: band position 0..1 across the title, or null for no band. */
  private draw(shine: number | null): void {
    const ctx = this.texture.getContext();
    const w = this.width;
    const h = this.height;
    const cx = w / 2;
    const cy = (h - this.shadow) / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.font = this.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.fillStyle = cssColor(COLORS.outline);
    ctx.fillText(this.text, cx, cy + this.shadow);
    ctx.lineWidth = this.stroke;
    ctx.strokeStyle = cssColor(COLORS.outline);
    ctx.strokeText(this.text, cx, cy);
    ctx.fillStyle = cssColor(COLORS.gold);
    ctx.fillText(this.text, cx, cy);

    if (shine !== null) {
      const { width, angleDeg, alpha } = MENU_FX.shine;
      const band = px(width);
      const x = -band + shine * (w + band * 2);
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.translate(x, cy);
      ctx.rotate((angleDeg * Math.PI) / 180);
      const grad = ctx.createLinearGradient(-band / 2, 0, band / 2, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(-band / 2, -h * 2, band, h * 4);
      ctx.restore();
    }
    this.texture.refresh();
  }
}
