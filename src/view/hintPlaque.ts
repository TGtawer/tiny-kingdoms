import type * as Phaser from 'phaser';
import { COLORS, HINT_PLAQUE } from '../config/game';
import { px, textStyle } from './layout';

/**
 * The look of every hint (the tutorial hint bar, lock hints, tour texts, node info, the goal plaque):
 * rounded panel with a soft shadow and a yellow outline. Centered at (cx, cy), game px.
 */
export function drawHintPlaque(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, h: number): void {
  const P = HINT_PLAQUE;
  const r = Math.min(px(P.radius), h / 2);
  g.fillStyle(COLORS.outline, P.shadowAlpha).fillRoundedRect(cx - w / 2 + px(P.shadowX), cy - h / 2 + px(P.shadowY), w, h, r);
  g.fillStyle(COLORS.panel, 1).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
  g.lineStyle(px(P.outline), COLORS.hint, 1).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
}

/**
 * Centered text on a hint plaque, as one container (its x, y is the plaque center; width/height its size).
 * `wrapWidth`: wrap long text to this width (game px).
 */
export function hintLabel(scene: Phaser.Scene, text: string, size: number, wrapWidth?: number): Phaser.GameObjects.Container {
  const P = HINT_PLAQUE;
  const label = scene.add.text(0, 0, text, textStyle(size, COLORS.textDark)).setOrigin(0.5).setAlign('center');
  if (wrapWidth !== undefined) label.setWordWrapWidth(wrapWidth, true);
  const w = label.width + px(P.padX) * 2;
  const h = label.height + px(P.padY) * 2;
  const g = scene.add.graphics();
  drawHintPlaque(g, 0, 0, w, h);
  return scene.add.container(0, 0, [g, label]).setSize(w, h);
}
