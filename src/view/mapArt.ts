import type * as Phaser from 'phaser';
import { COLORS, MAP_FX } from '../config/game';
import type { Owner } from '../core/sim/World';
import { drawSquad } from './ArmyView';
import { px } from './layout';

// Chapter map art (docs/VISUALS.md V-2): every picture is drawn once into a texture at the device pixel
// ratio, then used as sprites. Shapes are in CSS px as in docs/prototypes/living-screens.html.

export type DecorKind = (typeof MAP_FX.decor.kinds)[number]['kind'];

/** A baked picture and where its anchor (the item position / rotation pivot) is, as a 0..1 origin. */
export interface Baked {
  key: string;
  originX: number;
  originY: number;
}

/** Box of a picture around its anchor, CSS px: left, top, right, bottom. */
type Box = readonly [number, number, number, number];

const D = MAP_FX.decor;
const OUT = D.outline;

/**
 * Draws `paint` (CSS px, anchor at 0,0) into a texture of the device pixel ratio, once per key.
 * The Graphics is scaled while baking, so line widths are CSS px too.
 */
function bake(scene: Phaser.Scene, name: string, box: Box, paint: (g: Phaser.GameObjects.Graphics) => void): Baked {
  const k = px(1);
  const key = `map-${name}-${k}`;
  const [left, top, right, bottom] = box;
  const w = right - left;
  const h = bottom - top;
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({}, false);
    g.scaleCanvas(k, k);
    g.translateCanvas(-left, -top);
    paint(g);
    g.generateTexture(key, Math.ceil(w * k), Math.ceil(h * k));
    g.destroy();
  }
  return { key, originX: -left / w, originY: -top / h };
}

/** Body of a decor item (shadow excluded); `variant` picks the color for kinds that have two. */
export function decorTexture(scene: Phaser.Scene, kind: DecorKind, variant: 0 | 1): Baked {
  const c = D.colors;
  switch (kind) {
    case 'tree':
      // Anchor at the foot of the trunk: the tree sways around it.
      return bake(scene, `tree${variant}`, [-14, -34, 14, 2], (g) => {
        g.translateCanvas(0, -10);
        g.fillStyle(c.trunk, 1).fillRect(-2.5, -2, 5, 12);
        g.lineStyle(OUT, COLORS.outline, 1).strokeRect(-2.5, -2, 5, 12);
        g.fillStyle(c.tree[variant], 1).fillCircle(0, -10, 12);
        g.lineStyle(OUT, COLORS.outline, 1).strokeCircle(0, -10, 12);
        g.fillStyle(0xffffff, 0.2).fillCircle(-4, -14, 4.5);
      });
    case 'pine':
      return bake(scene, 'pine', [-13, -36, 13, 2], (g) => {
        g.translateCanvas(0, -11);
        g.fillStyle(c.trunk, 1).fillRect(-2, 4, 4, 7);
        for (const [y, w] of [
          [6, 11],
          [-2, 9],
          [-10, 7],
        ] as const) {
          g.fillStyle(c.pine, 1).fillTriangle(-w, y, 0, y - 13, w, y);
          g.lineStyle(OUT, COLORS.outline, 1).strokeTriangle(-w, y, 0, y - 13, w, y);
        }
      });
    case 'bush':
      return bake(scene, 'bush', [-13, -13, 13, 8], (g) => {
        g.fillStyle(c.bush, 1);
        for (const [x, y, r] of [
          [-5, 0, 6],
          [5, 0, 6],
          [0, -4, 7],
        ] as const) {
          g.fillCircle(x, y, r);
        }
        strokeArc(g, 0, -1, 9, 9, Math.PI * 0.95, Math.PI * 2.05, OUT, COLORS.outline, 1);
      });
    case 'house':
      return bake(scene, `house${variant}`, [-16, -20, 16, 11], (g) => {
        g.fillStyle(c.wall, 1).fillRect(-11, -6, 22, 15);
        g.lineStyle(OUT, COLORS.outline, 1).strokeRect(-11, -6, 22, 15);
        g.fillStyle(c.roof[variant], 1).fillTriangle(-14, -5, 0, -18, 14, -5);
        g.lineStyle(OUT, COLORS.outline, 1).strokeTriangle(-14, -5, 0, -18, 14, -5);
        g.fillStyle(c.trunk, 1).fillRect(-3, 1, 6, 8);
        g.fillStyle(c.window, 1).fillRect(5, -2, 4, 4);
      });
    case 'pond':
      return bake(scene, 'pond', [-24, -14, 24, 14], (g) => {
        g.fillStyle(c.pond, 1).fillEllipse(0, 0, 44, 24);
        strokeArc(g, 0, 0, 22, 12, 0, Math.PI * 2, OUT, COLORS.outline, 1);
        strokeArc(g, -4, -2, 9, 3, Math.PI * 1.1, Math.PI * 1.9, OUT, 0xffffff, 0.6);
      });
    case 'mill':
      return bake(scene, 'mill', [-11, -22, 11, 14], (g) => {
        const body = [
          [-9, 12],
          [-6, -12],
          [6, -12],
          [9, 12],
        ] as const;
        g.fillStyle(c.wall, 1).beginPath();
        body.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
        g.closePath().fillPath();
        g.lineStyle(OUT, COLORS.outline, 1);
        body.forEach(([x, y], i) => {
          const [nx, ny] = body[(i + 1) % body.length]!;
          g.lineBetween(x, y, nx, ny);
        });
        g.fillStyle(c.roof[1], 1).fillTriangle(-8, -11, 0, -20, 8, -11);
        g.lineStyle(OUT, COLORS.outline, 1).strokeTriangle(-8, -11, 0, -20, 8, -11);
      });
  }
}

/** Four mill sails around the hub (the rotation pivot). */
export function sailsTexture(scene: Phaser.Scene): Baked {
  return bake(scene, 'sails', [-20, -20, 20, 20], (g) => {
    for (let i = 0; i < 4; i++) {
      // A sail: a 17 x 5 bar from the hub outwards, as a rotated rectangle.
      const a = (i * Math.PI) / 2;
      const along = (d: number, side: number): [number, number] => [
        Math.cos(a) * d - Math.sin(a) * side,
        Math.sin(a) * d + Math.cos(a) * side,
      ];
      const corners = [along(1, -2.5), along(18, -2.5), along(18, 2.5), along(1, 2.5)];
      g.fillStyle(D.colors.sails, 1).beginPath();
      corners.forEach(([x, y], j) => (j === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.closePath().fillPath();
      g.lineStyle(OUT, COLORS.outline, 1);
      corners.forEach(([x, y], j) => {
        const [nx, ny] = corners[(j + 1) % 4]!;
        g.lineBetween(x, y, nx, ny);
      });
    }
    g.fillStyle(COLORS.outline, 1).fillCircle(0, 0, 2.5);
  });
}

/** Soft ground shadow: a black ellipse of 1 x 1 CSS px half-axes scaled per item. */
export function shadowTexture(scene: Phaser.Scene): Baked {
  return bake(scene, 'shadow', [-16, -16, 16, 16], (g) => {
    g.fillStyle(0x000000, 1).fillEllipse(0, 0, 32, 32);
  });
}

/** Chimney smoke puff, radius 8 CSS px (scaled while it grows). */
export function puffTexture(scene: Phaser.Scene): Baked {
  return bake(scene, 'puff', [-8, -8, 8, 8], (g) => {
    g.fillStyle(0xffffff, 1).fillCircle(0, 0, 8);
  });
}

/** Cloud with its own shadow below-right; the sprite's alpha is MAP_FX.clouds.alpha. */
export function cloudTexture(scene: Phaser.Scene): Baked {
  const c = MAP_FX.clouds;
  const [sx, sy] = c.shadowOffset;
  return bake(scene, 'cloud', [-42, -24, 66, 46], (g) => {
    // Pre-divided by the sprite alpha, so the shadow ends up at shadowAlpha.
    g.fillStyle(c.shadowColor, c.shadowAlpha / c.alpha);
    for (const [dx, dy, r] of c.shadowBlobs) g.fillEllipse(dx + sx, dy + sy, r * 2, r * 1.2);
    g.fillStyle(0xffffff, 1);
    for (const [dx, dy, r] of c.blobs) g.fillEllipse(dx, dy, r * 2, r * 1.4);
  });
}

/** Squad marker without a number (the map token and the walker); anchor at the disc center. */
export function squadTexture(scene: Phaser.Scene, radius: number, owner: Owner): Baked {
  const r = radius;
  return bake(scene, `squad-${owner}-${r}`, [-r - 2, -r * 1.7 - 2, r * 1.4 + 2, r + 2], (g) => drawSquad(g, r, owner, 1, false));
}

/** Ellipse arc outline as short straight pieces (Phaser strokes custom paths unreliably). */
function strokeArc(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: number,
  to: number,
  width: number,
  color: number,
  alpha: number,
): void {
  const steps = Math.max(6, Math.ceil(((to - from) / (Math.PI * 2)) * 32));
  g.lineStyle(width, color, alpha);
  for (let i = 0; i < steps; i++) {
    const a = from + ((to - from) * i) / steps;
    const b = from + ((to - from) * (i + 1)) / steps;
    g.lineBetween(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, cx + Math.cos(b) * rx, cy + Math.sin(b) * ry);
  }
  // Round the joints between the pieces (opaque lines only: translucent dots would show as darker beads).
  if (alpha < 1) return;
  g.fillStyle(color, alpha);
  for (let i = 1; i < steps; i++) {
    const a = from + ((to - from) * i) / steps;
    g.fillCircle(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, width / 2);
  }
}
