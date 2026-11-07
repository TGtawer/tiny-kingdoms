import type * as Phaser from 'phaser';
import type { BuildingType, LeaderId, NodeKind, SpellId } from '../config/balance';
import { COLORS, MENU_ICON, STAR_ROUNDING } from '../config/game';
import { roundedPolygon } from './roundedPolygon';

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
  } else if (spell === 'reinforcement') {
    // Green circle with a plus.
    g.fillStyle(COLORS.reinforcement, 1).fillCircle(x, y, s * 0.8);
    g.strokeCircle(x, y, s * 0.8);
    g.fillStyle(0xffffff, 1);
    g.fillRect(x - s * 0.13, y - s * 0.5, s * 0.26, s * 1.0);
    g.fillRect(x - s * 0.5, y - s * 0.13, s * 1.0, s * 0.26);
  } else {
    // Light-blue shield with a shine.
    g.fillStyle(COLORS.shield, 1);
    g.fillRoundedRect(x - s * 0.65, y - s * 0.8, s * 1.3, s * 1.0, s * 0.2);
    g.fillTriangle(x - s * 0.65, y + s * 0.1, x + s * 0.65, y + s * 0.1, x, y + s * 0.9);
    g.strokeRoundedRect(x - s * 0.65, y - s * 0.8, s * 1.3, s * 1.0, s * 0.2);
    g.lineBetween(x - s * 0.65, y + s * 0.1, x, y + s * 0.9);
    g.lineBetween(x + s * 0.65, y + s * 0.1, x, y + s * 0.9);
    g.fillStyle(0xffffff, 0.7).fillRoundedRect(x - s * 0.4, y - s * 0.6, s * 0.22, s * 0.8, s * 0.1);
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
/** Left arrow with rounded ends and corners: thick strokes with round caps. */
export function drawBack(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const s = size / 2;
  const w = s * 0.34;
  const tip = { x: x - s * 0.62, y };
  const ends = [
    { x: x + s * 0.68, y },
    { x: x - s * 0.02, y: y - s * 0.6 },
    { x: x - s * 0.02, y: y + s * 0.6 },
  ];
  g.lineStyle(w, COLORS.textDark, 1);
  g.fillStyle(COLORS.textDark, 1);
  for (const end of ends) {
    g.lineBetween(tip.x, tip.y, end.x, end.y);
    g.fillCircle(end.x, end.y, w / 2);
  }
  g.fillCircle(tip.x, tip.y, w / 2);
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
  // Two strokes with round ends and a round corner (discs at the three points hide the joint).
  const w = Math.max(2, size * 0.16);
  const pts = [
    [x - s * 0.42, y + s * 0.02],
    [x - s * 0.1, y + s * 0.32],
    [x + s * 0.45, y - s * 0.3],
  ] as const;
  g.lineStyle(w, 0xffffff, 1);
  g.lineBetween(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
  g.lineBetween(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
  g.fillStyle(0xffffff, 1);
  for (const [px, py] of pts) g.fillCircle(px, py, w / 2);
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
  // The outline is a dark star under a smaller fill: strokePath on this shape ignored the line width
  // (and doubled up when several stars shared one Graphics), so the outlines came out uneven.
  // The whole star, outline included, stays within `size`.
  const t = Math.max(1.5, size * 0.07);
  const outer = size / 2 - t * 1.8;
  const inner = outer * 0.45;
  starShape(g, x, y, size / 2, inner + t * 1.2);
  g.fillStyle(COLORS.outline, 1).fillPath();
  starShape(g, x, y, outer, inner);
  g.fillStyle(earned ? COLORS.gold : COLORS.starEmpty, 1).fillPath();
}

/** Five-point star path with rounded tips (and slightly rounded inner corners). */
function starShape(g: Phaser.GameObjects.Graphics, x: number, y: number, outer: number, inner: number): void {
  const corners = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, tip: i % 2 === 0 };
  });
  g.beginPath();
  corners.forEach((c, i) => {
    const prev = corners[(i + 9) % 10]!;
    const next = corners[(i + 1) % 10]!;
    // Cut the corner at share f of both edges and bend a quadratic curve through it.
    const f = c.tip ? STAR_ROUNDING.tip : STAR_ROUNDING.inner;
    const ax = c.x + (prev.x - c.x) * f;
    const ay = c.y + (prev.y - c.y) * f;
    const bx = c.x + (next.x - c.x) * f;
    const by = c.y + (next.y - c.y) * f;
    const steps = c.tip ? 8 : 3;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const px = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * c.x + t * t * bx;
      const py = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * c.y + t * t * by;
      if (i === 0 && k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
  });
  g.closePath();
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

/** Speaker with one sound wave (main menu toggle, as in docs/prototypes/living-screens.html). */
export function drawSpeaker(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const s = size;
  g.fillStyle(COLORS.outline, 1);
  fillPolygon(g, [
    [x - s * 0.35, y - s * 0.15],
    [x - s * 0.15, y - s * 0.15],
    [x + s * 0.1, y - s * 0.38],
    [x + s * 0.1, y + s * 0.38],
    [x - s * 0.15, y + s * 0.15],
    [x - s * 0.35, y + s * 0.15],
  ]);
  g.lineStyle(s * 0.09, COLORS.outline, 1);
  g.beginPath().arc(x + s * 0.12, y, s * 0.28, -0.8, 0.8).strokePath();
}

/** A single eighth note (main menu toggle, as in docs/prototypes/living-screens.html). */
export function drawNote(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const s = size;
  // Tilted note head: an ellipse rotated by -0.4 rad.
  const head: Array<[number, number]> = [];
  const cx = x - s * 0.12;
  const cy = y + s * 0.25;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const ex = Math.cos(a) * s * 0.16;
    const ey = Math.sin(a) * s * 0.12;
    head.push([cx + ex * Math.cos(-0.4) - ey * Math.sin(-0.4), cy + ex * Math.sin(-0.4) + ey * Math.cos(-0.4)]);
  }
  g.fillStyle(COLORS.outline, 1);
  fillPolygon(g, head);
  const w = s * 0.09;
  g.lineStyle(w, COLORS.outline, 1);
  g.lineBetween(x + s * 0.03, y + s * 0.25, x + s * 0.03, y - s * 0.35);
  g.lineBetween(x + s * 0.03, y - s * 0.35, x + s * 0.3, y - s * 0.2);
  // Round the corner where the stem meets the flag.
  g.fillCircle(x + s * 0.03, y - s * 0.35, w / 2);
}

/** Red strike-through over an icon: the setting is off. */
export function drawOff(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const s = size / 2;
  g.lineStyle(Math.max(3, size * 0.14), COLORS.panel, 1).lineBetween(x - s * 0.8, y - s * 0.8, x + s * 0.8, y + s * 0.8);
  g.lineStyle(Math.max(2, size * 0.09), COLORS.faction.enemy, 1).lineBetween(x - s * 0.8, y - s * 0.8, x + s * 0.8, y + s * 0.8);
}

/** Fills a closed polygon with the current fill style. */
function fillPolygon(g: Phaser.GameObjects.Graphics, points: ReadonlyArray<readonly [number, number]>): void {
  g.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)));
  g.closePath().fillPath();
}

/** One half of drawLock (-1 = left, 1 = right), centered like the whole lock: the pieces of a broken lock. */
export function drawLockHalf(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, side: -1 | 1): void {
  const s = size / 2;
  g.lineStyle(Math.max(2, size * 0.12), COLORS.textDark, 1);
  const from = side < 0 ? Math.PI : Math.PI * 1.5;
  g.beginPath().arc(x, y - s * 0.15, s * 0.4, from, from + Math.PI / 2).strokePath();
  const r = s * 0.15;
  const radius = side < 0 ? { tl: r, tr: 0, bl: r, br: 0 } : { tl: 0, tr: r, bl: 0, br: r };
  g.fillStyle(COLORS.textDark, 1).fillRoundedRect(side < 0 ? x - s * 0.6 : x, y - s * 0.15, s * 0.6, s * 0.95, radius);
}

/** Strokes a closed polygon with the current line style. */
function strokePolygon(g: Phaser.GameObjects.Graphics, points: ReadonlyArray<readonly [number, number]>): void {
  g.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)));
  g.closePath().strokePath();
}

export type MenuIcon = 'play' | 'map' | 'hammer';

/**
 * Icons inside the main menu medallions (docs/prototypes/menu-mobile-tournament.html), centered at (x, y),
 * `s` = icon box. Line widths are in the caller's units (the menu draws at reference scale).
 */
export function drawMenuIcon(g: Phaser.GameObjects.Graphics, kind: MenuIcon, x: number, y: number, s: number): void {
  const line = 2.5;
  if (kind === 'play') {
    // Rounded corners: the fill and the outline follow the same contour.
    const tri = roundedPolygon(
      [
        [x - s * 0.28, y - s * 0.42],
        [x + s * 0.44, y],
        [x - s * 0.28, y + s * 0.42],
      ],
      s * MENU_ICON.playCorner,
      MENU_ICON.cornerSegments,
    );
    g.fillStyle(0xffffff, 1);
    fillPolygon(g, tri);
    g.lineStyle(line, COLORS.outline, 1);
    strokePolygon(g, tri);
    return;
  }
  if (kind === 'map') {
    const sheet = [
      [-0.5, -0.32],
      [-0.17, -0.44],
      [0.17, -0.32],
      [0.5, -0.44],
      [0.5, 0.32],
      [0.17, 0.44],
      [-0.17, 0.32],
      [-0.5, 0.44],
    ].map(([px, py]) => [x + px! * s, y + py! * s] as const);
    g.fillStyle(COLORS.panel, 1);
    fillPolygon(g, sheet);
    g.lineStyle(line, COLORS.outline, 1);
    strokePolygon(g, sheet);
    g.lineBetween(x - s * 0.17, y - s * 0.44, x - s * 0.17, y + s * 0.32);
    g.lineBetween(x + s * 0.17, y - s * 0.32, x + s * 0.17, y + s * 0.44);
    g.fillStyle(COLORS.faction.enemy, 1).fillCircle(x + s * 0.33, y - s * 0.05, s * 0.09);
    return;
  }
  // Hammer, tilted by -0.6 rad around the icon center.
  const a = -0.6;
  const rot = (px: number, py: number): readonly [number, number] => [x + px * Math.cos(a) - py * Math.sin(a), y + px * Math.sin(a) + py * Math.cos(a)];
  const rect = (rx: number, ry: number, rw: number, rh: number): ReadonlyArray<readonly [number, number]> => [
    rot(rx, ry),
    rot(rx + rw, ry),
    rot(rx + rw, ry + rh),
    rot(rx, ry + rh),
  ];
  const handle = rect(-s * 0.07, -s * 0.2, s * 0.14, s * 0.7);
  const head = rect(-s * 0.38, -s * 0.44, s * 0.76, s * 0.28);
  g.fillStyle(COLORS.panelEdge, 1);
  fillPolygon(g, handle);
  g.lineStyle(line, COLORS.outline, 1);
  strokePolygon(g, handle);
  g.fillStyle(0xcbd5e1, 1);
  fillPolygon(g, head);
  strokePolygon(g, head);
}

/** Lighter (f > 0) or darker (f < 0) version of a color, as in the prototypes' `shade`. */
export function shade(color: number, f: number): number {
  const m = (c: number): number => Math.max(0, Math.min(255, Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f)));
  return (m((color >> 16) & 255) << 16) | (m((color >> 8) & 255) << 8) | m(color & 255);
}

/** Cartoon pointing hand (tutorial finger); the fingertip is at (0, 0). `s`: game px per CSS px. */
export function drawFinger(g: Phaser.GameObjects.Graphics, s: number): void {
  const line = 2.5 * s;
  g.clear();
  // Finger.
  g.fillStyle(0xffffff, 1).fillRoundedRect(-7 * s, -2 * s, 14 * s, 30 * s, 7 * s);
  g.lineStyle(line, COLORS.outline, 1).strokeRoundedRect(-7 * s, -2 * s, 14 * s, 30 * s, 7 * s);
  // Palm with folded fingers.
  g.fillStyle(0xffffff, 1).fillRoundedRect(-9 * s, 18 * s, 30 * s, 26 * s, 10 * s);
  g.lineStyle(line, COLORS.outline, 1).strokeRoundedRect(-9 * s, 18 * s, 30 * s, 26 * s, 10 * s);
  g.lineStyle(1.5 * s, COLORS.outline, 0.6);
  g.lineBetween(7 * s, 24 * s, 7 * s, 32 * s);
  g.lineBetween(14 * s, 24 * s, 14 * s, 32 * s);
  // Tap glow at the tip.
  g.fillStyle(COLORS.hint, 0.6).fillCircle(0, 0, 5 * s);
}
