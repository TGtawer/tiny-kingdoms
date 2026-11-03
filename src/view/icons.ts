import type * as Phaser from 'phaser';
import type { BuildingType, LeaderId, NodeKind, SpellId } from '../config/balance';
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

/** Blue crystal (meta currency). */
export function drawCrystal(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const s = size / 2;
  const line = Math.max(1, size * 0.07);
  const top = { x, y: y - s };
  const left = { x: x - s * 0.75, y: y - s * 0.25 };
  const right = { x: x + s * 0.75, y: y - s * 0.25 };
  const bottom = { x, y: y + s };
  g.fillStyle(0x5ad1ff, 1).fillTriangle(top.x, top.y, left.x, left.y, right.x, right.y);
  g.fillStyle(0x2f9be0, 1).fillTriangle(left.x, left.y, right.x, right.y, bottom.x, bottom.y);
  g.fillStyle(0xffffff, 0.55).fillTriangle(top.x, top.y, left.x, left.y, x - s * 0.15, y - s * 0.25);
  g.lineStyle(line, COLORS.outline, 1);
  g.strokeTriangle(top.x, top.y, left.x, left.y, right.x, right.y);
  g.strokeTriangle(left.x, left.y, right.x, right.y, bottom.x, bottom.y);
}

/** Left arrow for "back" buttons. */
export function drawBack(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const s = size / 2;
  g.fillStyle(COLORS.textDark, 1);
  g.fillTriangle(x - s * 0.8, y, x - s * 0.05, y - s * 0.7, x - s * 0.05, y + s * 0.7);
  g.fillRect(x - s * 0.1, y - s * 0.25, s * 0.85, s * 0.5);
}

/** Padlock for locked items. */
export function drawLock(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const s = size / 2;
  g.lineStyle(Math.max(2, size * 0.12), COLORS.textDark, 1);
  g.beginPath().arc(x, y - s * 0.15, s * 0.4, Math.PI, 0).strokePath();
  g.fillStyle(COLORS.textDark, 1).fillRoundedRect(x - s * 0.6, y - s * 0.15, s * 1.2, s * 0.95, s * 0.15);
}

/** Check mark for completed levels. */
export function drawCheck(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const s = size / 2;
  g.fillStyle(COLORS.reinforcement, 1).fillCircle(x, y, s);
  g.lineStyle(Math.max(1, size * 0.08), COLORS.outline, 1).strokeCircle(x, y, s);
  g.lineStyle(Math.max(2, size * 0.16), 0xffffff, 1);
  g.lineBetween(x - s * 0.45, y, x - s * 0.1, y + s * 0.35);
  g.lineBetween(x - s * 0.1, y + s * 0.35, x + s * 0.5, y - s * 0.35);
}

/** Enemy leader portrait in a round frame, centered at (x, y). */
export function drawLeader(g: Phaser.GameObjects.Graphics, leader: LeaderId, x: number, y: number, size: number): void {
  const s = size / 2;
  const line = Math.max(1.5, size * 0.04);
  // Frame and background.
  g.fillStyle(COLORS.factionDark.enemy, 1).fillCircle(x, y, s);
  g.fillStyle(0xf6d7b0, 1).fillCircle(x, y + s * 0.1, s * 0.52); // face
  g.lineStyle(line, COLORS.outline, 1).strokeCircle(x, y + s * 0.1, s * 0.52);
  // Eyes.
  g.fillStyle(COLORS.outline, 1).fillCircle(x - s * 0.18, y + s * 0.02, s * 0.06).fillCircle(x + s * 0.18, y + s * 0.02, s * 0.06);

  switch (leader) {
    case 'king': {
      // Crown and a calm smile.
      g.fillStyle(COLORS.gold, 1);
      g.fillTriangle(x - s * 0.5, y - s * 0.3, x - s * 0.5, y - s * 0.7, x - s * 0.2, y - s * 0.38);
      g.fillTriangle(x - s * 0.25, y - s * 0.38, x, y - s * 0.82, x + s * 0.25, y - s * 0.38);
      g.fillTriangle(x + s * 0.2, y - s * 0.38, x + s * 0.5, y - s * 0.7, x + s * 0.5, y - s * 0.3);
      g.fillRect(x - s * 0.5, y - s * 0.4, s, s * 0.14);
      g.lineStyle(line, COLORS.outline, 1).strokeRect(x - s * 0.5, y - s * 0.4, s, s * 0.14);
      g.lineStyle(line, COLORS.outline, 1).beginPath().arc(x, y + s * 0.2, s * 0.18, 0.2, Math.PI - 0.2).strokePath();
      break;
    }
    case 'baron': {
      // Horned helmet and an angry mouth.
      g.fillStyle(0x9aa3ad, 1).fillRect(x - s * 0.55, y - s * 0.45, s * 1.1, s * 0.3);
      g.lineStyle(line, COLORS.outline, 1).strokeRect(x - s * 0.55, y - s * 0.45, s * 1.1, s * 0.3);
      g.fillStyle(0xf4efe2, 1);
      g.fillTriangle(x - s * 0.55, y - s * 0.35, x - s * 0.85, y - s * 0.85, x - s * 0.4, y - s * 0.45);
      g.fillTriangle(x + s * 0.55, y - s * 0.35, x + s * 0.85, y - s * 0.85, x + s * 0.4, y - s * 0.45);
      g.lineStyle(line * 1.4, COLORS.outline, 1);
      g.lineBetween(x - s * 0.3, y - s * 0.12, x - s * 0.08, y - s * 0.04);
      g.lineBetween(x + s * 0.3, y - s * 0.12, x + s * 0.08, y - s * 0.04);
      g.lineBetween(x - s * 0.18, y + s * 0.32, x + s * 0.18, y + s * 0.32);
      break;
    }
    case 'dwarf': {
      // Big beard and a cap.
      g.fillStyle(0xc0702f, 1);
      g.fillTriangle(x - s * 0.55, y + s * 0.1, x + s * 0.55, y + s * 0.1, x, y + s * 0.95);
      g.fillCircle(x, y + s * 0.3, s * 0.42);
      g.fillStyle(0x4b6b3a, 1).fillEllipse(x, y - s * 0.42, s * 1.1, s * 0.4);
      g.lineStyle(line, COLORS.outline, 1).strokeEllipse(x, y - s * 0.42, s * 1.1, s * 0.4);
      g.fillStyle(COLORS.outline, 1).fillCircle(x - s * 0.18, y + s * 0.02, s * 0.06).fillCircle(x + s * 0.18, y + s * 0.02, s * 0.06);
      break;
    }
    case 'witch': {
      // Pointy hat with a brim and a sly grin.
      g.fillStyle(0x4c1d95, 1);
      g.fillTriangle(x - s * 0.4, y - s * 0.3, x + s * 0.4, y - s * 0.3, x + s * 0.15, y - s * 0.98);
      g.fillEllipse(x, y - s * 0.3, s * 1.3, s * 0.22);
      g.lineStyle(line, COLORS.outline, 1).strokeTriangle(x - s * 0.4, y - s * 0.3, x + s * 0.4, y - s * 0.3, x + s * 0.15, y - s * 0.98);
      g.fillStyle(0xa3e635, 1).fillCircle(x - s * 0.18, y + s * 0.02, s * 0.06).fillCircle(x + s * 0.18, y + s * 0.02, s * 0.06);
      g.lineStyle(line, COLORS.outline, 1).beginPath().arc(x + s * 0.05, y + s * 0.18, s * 0.18, 0.4, Math.PI - 0.9).strokePath();
      break;
    }
  }
  g.lineStyle(line * 1.5, COLORS.outline, 1).strokeCircle(x, y, s);
}

/** Icon of a special node kind (GDD 3.12), centered at (x, y). */
export function drawKind(g: Phaser.GameObjects.Graphics, kind: NodeKind, x: number, y: number, size: number): void {
  const s = size / 2;
  const line = Math.max(1, size * 0.08);
  g.lineStyle(line, COLORS.outline, 1);
  switch (kind) {
    case 'temple': {
      // Roof and three columns.
      g.fillStyle(0xf4efe2, 1);
      g.fillTriangle(x - s * 0.95, y - s * 0.35, x + s * 0.95, y - s * 0.35, x, y - s * 0.95);
      g.strokeTriangle(x - s * 0.95, y - s * 0.35, x + s * 0.95, y - s * 0.35, x, y - s * 0.95);
      for (const dx of [-0.6, 0, 0.6]) {
        g.fillRect(x + s * (dx - 0.13), y - s * 0.3, s * 0.26, s * 0.95);
        g.strokeRect(x + s * (dx - 0.13), y - s * 0.3, s * 0.26, s * 0.95);
      }
      g.fillRect(x - s * 0.95, y + s * 0.65, s * 1.9, s * 0.25);
      g.strokeRect(x - s * 0.95, y + s * 0.65, s * 1.9, s * 0.25);
      break;
    }
    case 'fortress': {
      // Shield.
      g.fillStyle(0x9aa3ad, 1);
      g.fillRoundedRect(x - s * 0.75, y - s * 0.85, s * 1.5, s * 1.0, s * 0.15);
      g.fillTriangle(x - s * 0.75, y + s * 0.1, x + s * 0.75, y + s * 0.1, x, y + s * 0.95);
      g.strokeRoundedRect(x - s * 0.75, y - s * 0.85, s * 1.5, s * 1.0, s * 0.15);
      g.lineBetween(x - s * 0.75, y + s * 0.1, x, y + s * 0.95);
      g.lineBetween(x + s * 0.75, y + s * 0.1, x, y + s * 0.95);
      g.fillStyle(COLORS.outline, 1).fillRect(x - s * 0.08, y - s * 0.6, s * 0.16, s * 1.1);
      break;
    }
    case 'chest': {
      g.fillStyle(0xa86a32, 1);
      g.fillRoundedRect(x - s * 0.9, y - s * 0.55, s * 1.8, s * 0.6, { tl: s * 0.4, tr: s * 0.4, bl: 0, br: 0 });
      g.fillRect(x - s * 0.9, y + s * 0.05, s * 1.8, s * 0.8);
      g.strokeRoundedRect(x - s * 0.9, y - s * 0.55, s * 1.8, s * 0.6, { tl: s * 0.4, tr: s * 0.4, bl: 0, br: 0 });
      g.strokeRect(x - s * 0.9, y + s * 0.05, s * 1.8, s * 0.8);
      g.fillStyle(COLORS.gold, 1).fillRect(x - s * 0.18, y - s * 0.1, s * 0.36, s * 0.4);
      g.strokeRect(x - s * 0.18, y - s * 0.1, s * 0.36, s * 0.4);
      break;
    }
    case 'portal': {
      g.lineStyle(Math.max(2, size * 0.14), COLORS.portal, 1);
      g.beginPath().arc(x, y, s * 0.85, 0, Math.PI * 1.6).strokePath();
      g.beginPath().arc(x, y, s * 0.45, Math.PI, Math.PI * 2.6).strokePath();
      g.fillStyle(COLORS.portal, 1).fillCircle(x, y, s * 0.15);
      break;
    }
    case 'bandits': {
      // Crossed swords.
      g.lineStyle(Math.max(2, size * 0.14), 0xd8dde3, 1);
      g.lineBetween(x - s * 0.8, y + s * 0.8, x + s * 0.7, y - s * 0.7);
      g.lineBetween(x + s * 0.8, y + s * 0.8, x - s * 0.7, y - s * 0.7);
      g.lineStyle(Math.max(2, size * 0.16), 0x6b4a2b, 1);
      g.lineBetween(x - s * 0.85, y + s * 0.45, x - s * 0.45, y + s * 0.85);
      g.lineBetween(x + s * 0.85, y + s * 0.45, x + s * 0.45, y + s * 0.85);
      break;
    }
    case 'normal':
      break;
  }
}

/** Five-point star: gold when earned, dim when not. */
export function drawStar(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, earned: boolean): void {
  const outer = size / 2;
  const inner = outer * 0.45;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle(earned ? COLORS.gold : COLORS.starEmpty, 1).fillPath();
  g.lineStyle(Math.max(1, size * 0.07), COLORS.outline, 1).strokePath();
}

/** Golden crown marking a capital (start castle). */
export function drawCrown(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const s = size / 2;
  const line = Math.max(1, size * 0.08);
  const base = y + s * 0.55;
  const rim = y - s * 0.05;
  g.fillStyle(COLORS.gold, 1);
  g.beginPath();
  g.moveTo(x - s * 0.9, base);
  g.lineTo(x - s * 0.9, y - s * 0.55);
  g.lineTo(x - s * 0.45, rim);
  g.lineTo(x, y - s * 0.85);
  g.lineTo(x + s * 0.45, rim);
  g.lineTo(x + s * 0.9, y - s * 0.55);
  g.lineTo(x + s * 0.9, base);
  g.closePath();
  g.fillPath();
  g.lineStyle(line, COLORS.outline, 1).strokePath();
  g.fillStyle(COLORS.goldDark, 1).fillRect(x - s * 0.9, base - s * 0.25, s * 1.8, s * 0.25);
  g.strokeRect(x - s * 0.9, base - s * 0.25, s * 1.8, s * 0.25);
  g.fillStyle(COLORS.faction.enemy, 1).fillCircle(x, y - s * 0.85, s * 0.16);
}

export function drawPause(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const s = size / 2;
  g.fillStyle(COLORS.textDark, 1);
  g.fillRoundedRect(x - s * 0.55, y - s * 0.6, s * 0.38, s * 1.2, s * 0.1);
  g.fillRoundedRect(x + s * 0.17, y - s * 0.6, s * 0.38, s * 1.2, s * 0.1);
}
