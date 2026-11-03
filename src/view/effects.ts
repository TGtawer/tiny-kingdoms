import type * as Phaser from 'phaser';
import { COLORS } from '../config/game';
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
