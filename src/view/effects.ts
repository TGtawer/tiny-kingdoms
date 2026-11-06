import type * as Phaser from 'phaser';
import { COLORS, INFO_LABEL_MS } from '../config/game';
import { hintLabel } from './hintPlaque';
import { drawCoin } from './icons';
import { px, textStyle } from './layout';

/** Expanding ring that fades out. */
export function ringBurst(scene: Phaser.Scene, x: number, y: number, radius: number, color: number): void {
  const g = scene.add.graphics({ x, y });
  g.lineStyle(px(4), color, 1).strokeCircle(0, 0, radius);
  scene.tweens.add({
    targets: g,
    scale: 1.7,
    alpha: 0,
    duration: 420,
    ease: 'Cubic.Out',
    onComplete: () => g.destroy(),
  });
}

/** Squash-and-stretch pop on a game object (e.g. a captured node). */
export function pop(scene: Phaser.Scene, target: Phaser.GameObjects.Components.Transform): void {
  scene.tweens.add({ targets: target, scale: 1.18, duration: 110, yoyo: true, ease: 'Quad.Out' });
}

/**
 * Short label on a panel that fades after INFO_LABEL_MS (e.g. "Opens at level 3" on a locked button).
 * Screen coordinates (does not scroll with the camera), kept inside the screen; `y` is the bottom edge.
 */
export function toast(scene: Phaser.Scene, x: number, y: number, text: string, depth = 300): Phaser.GameObjects.Container {
  const label = hintLabel(scene, text, 15).setScrollFactor(0, 0, true).setDepth(depth);
  const w = scene.scale.width;
  label.setPosition(Math.min(Math.max(x, label.width / 2 + px(6)), w - label.width / 2 - px(6)), y - label.height / 2);
  scene.tweens.add({ targets: label, alpha: 0, delay: INFO_LABEL_MS, duration: 300, onComplete: () => label.destroy() });
  return label;
}

/** Floating number such as "-8" above a point. */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: number): void {
  const label = scene.add.text(x, y, text, textStyle(18, color)).setOrigin(0.5).setStroke('#1f2937', px(4));
  scene.tweens.add({
    targets: label,
    y: y - px(36),
    alpha: 0,
    duration: 800,
    ease: 'Cubic.Out',
    onComplete: () => label.destroy(),
  });
}

/** "+10" with a coin floating up above a point: gold given by a capture (chest, neutral node). */
export function goldFloat(scene: Phaser.Scene, x: number, y: number, text: string): void {
  const label = scene.add.text(0, 0, text, textStyle(18, COLORS.gold)).setOrigin(0, 0.5).setStroke('#1f2937', px(4));
  const size = px(18);
  const coin = scene.add.graphics();
  drawCoin(coin, 0, 0, size);
  // The coin and the number side by side, centered on x.
  const width = size + px(3) + label.width;
  coin.setX(-width / 2 + size / 2);
  label.setX(-width / 2 + size + px(3));
  const box = scene.add.container(x, y, [coin, label]).setDepth(70);
  scene.tweens.add({
    targets: box,
    y: y - px(36),
    alpha: 0,
    duration: 900,
    ease: 'Cubic.Out',
    onComplete: () => box.destroy(),
  });
}

/** Fireball impact: filled flash plus rings. */
export function explosion(scene: Phaser.Scene, x: number, y: number, radius: number): void {
  const g = scene.add.graphics({ x, y });
  g.fillStyle(COLORS.fireball, 0.85).fillCircle(0, 0, radius);
  g.fillStyle(0xffd23f, 0.9).fillCircle(0, 0, radius * 0.55);
  g.setScale(0.4);
  scene.tweens.add({
    targets: g,
    scale: 1.5,
    alpha: 0,
    duration: 500,
    ease: 'Cubic.Out',
    onComplete: () => g.destroy(),
  });
  ringBurst(scene, x, y, radius, COLORS.fireball);
}

/** Little dots that burst out of a point and fade (stars earned, a level opened). */
export function sparks(scene: Phaser.Scene, x: number, y: number, color: number, count: number, distance: number, durationMs: number, size: number, depth = 5): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const d = distance * (0.7 + Math.random() * 0.6);
    const g = scene.add.graphics({ x, y }).setDepth(depth);
    g.fillStyle(color, 1).fillCircle(0, 0, size);
    scene.tweens.add({
      targets: g,
      x: x + Math.cos(angle) * d,
      y: y + Math.sin(angle) * d,
      alpha: 0,
      scale: 0.5,
      duration: durationMs,
      ease: 'Cubic.Out',
      onComplete: () => g.destroy(),
    });
  }
}
