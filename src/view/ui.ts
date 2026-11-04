import type * as Phaser from 'phaser';
import { COLORS, HUD } from '../config/game';
import { Button } from './Button';
import { drawBack, drawCrystal } from './icons';
import { px, textStyle } from './layout';

/** Meadow background with deterministic grass tufts. */
export function drawMeadow(g: Phaser.GameObjects.Graphics, w: number, h: number): void {
  g.clear();
  g.fillStyle(COLORS.background, 1).fillRect(0, 0, w, h);
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const count = Math.round((w * h) / (px(70) * px(70)));
  g.lineStyle(px(2), COLORS.backgroundDark, 0.8);
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const s = px(4 + rnd() * 3);
    g.lineBetween(x - s, y, x - s * 0.4, y - s * 1.2);
    g.lineBetween(x, y, x, y - s * 1.5);
    g.lineBetween(x + s, y, x + s * 0.4, y - s * 1.2);
  }
}

/**
 * Seamless meadow tile (grass color with tufts) baked into a texture, for maps larger than the screen:
 * a TileSprite of it scrolls with the world. Tufts near an edge are repeated on the opposite side.
 * Returns the texture key; `sizeCss` is the tile side in CSS px.
 */
export function meadowTile(scene: Phaser.Scene, sizeCss: number): string {
  const size = Math.round(px(sizeCss));
  const key = `meadow-tile-${size}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  g.fillStyle(COLORS.background, 1).fillRect(0, 0, size, size);
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const count = Math.round((size * size) / (px(70) * px(70)));
  g.lineStyle(px(2), COLORS.backgroundDark, 0.8);
  for (let i = 0; i < count; i++) {
    const x0 = rnd() * size;
    const y0 = rnd() * size;
    const s = px(4 + rnd() * 3);
    // Draw the tuft in the tile and in the neighbours it pokes into, so the edges match up.
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (x + s < 0 || x - s > size || y < 0 || y - s * 1.5 > size) continue;
        g.lineBetween(x - s, y, x - s * 0.4, y - s * 1.2);
        g.lineBetween(x, y, x, y - s * 1.5);
        g.lineBetween(x + s, y, x + s * 0.4, y - s * 1.2);
      }
    }
  }
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/** Rounded button with a centered text label. Sizes in game px. */
export function textButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  onClick: () => void,
  options: { size?: number; color?: number } = {},
): Button {
  const { size = 20, color } = options;
  const button = new Button(scene, x, y, {
    width,
    height,
    onClick,
    ...(color !== undefined ? { color } : {}),
  });
  button.add(scene.add.text(0, -px(2), label, textStyle(size, COLORS.textDark)).setOrigin(0.5));
  return button;
}

/**
 * Top bar used by menu screens: optional back button on the left, title in the middle,
 * crystal counter on the right. Returns the bar height in game px.
 */
export function topBar(scene: Phaser.Scene, title: string, crystals: number, onBack?: () => void): number {
  const w = scene.scale.width;
  const barH = px(HUD.topBar);
  scene.add.graphics().fillStyle(COLORS.outline, 0.28).fillRect(0, 0, w, barH);
  if (onBack) {
    const size = px(HUD.pauseButton);
    const back = new Button(scene, px(12) + size / 2, barH / 2, { width: size, height: size, onClick: onBack });
    const icon = scene.add.graphics();
    drawBack(icon, 0, 0, size * 0.5);
    back.add(icon);
  }
  scene.add.text(w / 2, barH / 2, title, textStyle(22)).setOrigin(0.5).setStroke('#1f2937', px(5));
  crystalCounter(scene, w - px(14), barH / 2, crystals);
  return barH;
}

/** Crystal icon with a number, right-aligned at (x, y). */
export function crystalCounter(scene: Phaser.Scene, x: number, y: number, crystals: number, sizeCss = 22): void {
  const text = scene.add.text(x, y, String(crystals), textStyle(sizeCss)).setOrigin(1, 0.5).setStroke('#1f2937', px(5));
  const icon = scene.add.graphics();
  drawCrystal(icon, x - text.width - px(16), y, px(sizeCss));
}
