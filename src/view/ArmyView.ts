import type * as Phaser from 'phaser';
import { COLORS, SQUAD_LIP } from '../config/game';
import type { Owner } from '../core/sim/World';

/**
 * Squad marker body without the number, centered at (0, 0): ground shadow, colored disc, outline, banner.
 * `unit` scales the line widths (px(1) on screen, 1 when baking at CSS scale).
 */
export function drawSquad(g: Phaser.GameObjects.Graphics, r: number, owner: Owner, unit: number, shadow = true): void {
  if (shadow) g.fillStyle(0x000000, 0.2).fillEllipse(0, r * 0.9, r * 2, r * 0.6);
  // Rim exactly under the outline, the face a bit higher inside it (as on the nodes).
  g.fillStyle(COLORS.factionDark[owner], 1).fillCircle(0, 0, r);
  g.fillStyle(COLORS.faction[owner], 1).fillCircle(0, -r * SQUAD_LIP, r * (1 - SQUAD_LIP));
  g.lineStyle(2.5 * unit, COLORS.outline, 1).strokeCircle(0, 0, r);
  // Little banner pole to read as "marching squad".
  g.lineStyle(2 * unit, COLORS.outline, 1).lineBetween(r * 0.6, -r * 0.6, r * 0.6, -r * 1.7);
  g.fillStyle(COLORS.faction[owner], 1).fillTriangle(r * 0.6, -r * 1.7, r * 1.4, -r * 1.45, r * 0.6, -r * 1.2);
  g.lineStyle(1.5 * unit, COLORS.outline, 1).strokeTriangle(r * 0.6, -r * 1.7, r * 1.4, -r * 1.45, r * 0.6, -r * 1.2);
}
