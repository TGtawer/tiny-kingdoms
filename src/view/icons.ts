import type * as Phaser from 'phaser';
import type { BuildingType, SpellId } from '../config/balance';
import { COLORS } from '../config/game';

// Simple cartoon icons drawn with Graphics, centered at (x, y), fitting in a box of `size`.

export function drawCoin(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const r = size / 2;
  g.fillStyle(COLORS.goldDark, 1).fillCircle(x, y + r * 0.12, r);
  g.fillStyle(COLORS.gold, 1).fillCircle(x, y, r);
  g.lineStyle(Math.max(1, r * 0.16), COLORS.goldDark, 1).strokeCircle(x, y, r * 0.62);
  g.fillStyle(0xffffff, 0.55).fillCircle(x - r * 0.35, y - r * 0.35, r * 0.18);
}

export function drawBuilding(
  g: Phaser.GameObjects.Graphics,
  type: BuildingType,
  x: number,
  y: number,
  size: number,
): void {
  const s = size / 2;
  const line = Math.max(1, size * 0.08);
  g.lineStyle(line, COLORS.outline, 1);

  switch (type) {
    case 'mine': {
      // Cave arch with a gold nugget.
      g.fillStyle(0x8b6b4a, 1);
      g.fillRoundedRect(x - s * 0.9, y - s * 0.6, s * 1.8, s * 1.4, s * 0.6);
      g.strokeRoundedRect(x - s * 0.9, y - s * 0.6, s * 1.8, s * 1.4, s * 0.6);
      g.fillStyle(0x2b2118, 1).fillRoundedRect(x - s * 0.45, y - s * 0.15, s * 0.9, s * 0.95, s * 0.4);
      g.fillStyle(COLORS.gold, 1).fillCircle(x + s * 0.05, y + s * 0.5, s * 0.3);
      g.strokeCircle(x + s * 0.05, y + s * 0.5, s * 0.3);
      break;
    }
    case 'barracks': {
      // Tent with a flag.
      g.fillStyle(0xf4e3c1, 1);
      g.fillTriangle(x - s * 0.9, y + s * 0.75, x + s * 0.9, y + s * 0.75, x, y - s * 0.55);
      g.strokeTriangle(x - s * 0.9, y + s * 0.75, x + s * 0.9, y + s * 0.75, x, y - s * 0.55);
      g.fillStyle(0x2b2118, 1).fillTriangle(x - s * 0.25, y + s * 0.75, x + s * 0.25, y + s * 0.75, x, y + s * 0.1);
      g.lineBetween(x, y - s * 0.55, x, y - s * 0.95);
      g.fillStyle(0xe23b3b, 1).fillTriangle(x, y - s * 0.95, x + s * 0.5, y - s * 0.82, x, y - s * 0.68);
      break;
    }
    case 'tower': {
      // Stone tower with battlements.
      g.fillStyle(0xc9c3b6, 1);
      g.fillRect(x - s * 0.5, y - s * 0.45, s, s * 1.25);
      g.strokeRect(x - s * 0.5, y - s * 0.45, s, s * 1.25);
      for (const dx of [-0.5, -0.1, 0.3]) {
        g.fillRect(x + s * dx, y - s * 0.8, s * 0.2, s * 0.35);
        g.strokeRect(x + s * dx, y - s * 0.8, s * 0.2, s * 0.35);
      }
      g.fillStyle(0x2b2118, 1).fillRect(x - s * 0.12, y - s * 0.15, s * 0.24, s * 0.35);
      break;
    }
  }
}

export function drawSpell(g: Phaser.GameObjects.Graphics, spell: SpellId, x: number, y: number, size: number): void {
  const s = size / 2;
  const line = Math.max(1, size * 0.07);
  g.lineStyle(line, COLORS.outline, 1);

  if (spell === 'fireball') {
    g.fillStyle(COLORS.fireball, 1);
    g.fillTriangle(x - s * 0.55, y - s * 0.1, x + s * 0.55, y - s * 0.1, x + s * 0.35, y - s * 0.95);
    g.fillCircle(x, y + s * 0.2, s * 0.6);
    g.strokeCircle(x, y + s * 0.2, s * 0.6);
    g.fillStyle(0xffd23f, 1).fillCircle(x, y + s * 0.3, s * 0.32);
  } else {
    // Shield with a plus.
    g.fillStyle(COLORS.reinforcement, 1);
    g.fillRoundedRect(x - s * 0.65, y - s * 0.8, s * 1.3, s * 1.0, s * 0.2);
    g.fillTriangle(x - s * 0.65, y + s * 0.1, x + s * 0.65, y + s * 0.1, x, y + s * 0.9);
    g.strokeRoundedRect(x - s * 0.65, y - s * 0.8, s * 1.3, s * 1.0, s * 0.2);
    g.fillStyle(0xffffff, 1);
    g.fillRect(x - s * 0.1, y - s * 0.55, s * 0.2, s * 0.8);
    g.fillRect(x - s * 0.4, y - s * 0.25, s * 0.8, s * 0.2);
  }
}

export function drawPause(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const s = size / 2;
  g.fillStyle(COLORS.textDark, 1);
  g.fillRoundedRect(x - s * 0.55, y - s * 0.6, s * 0.38, s * 1.2, s * 0.1);
  g.fillRoundedRect(x + s * 0.17, y - s * 0.6, s * 0.38, s * 1.2, s * 0.1);
}
