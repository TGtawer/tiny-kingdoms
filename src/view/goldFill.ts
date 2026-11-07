import type * as Phaser from 'phaser';
import { mixColor } from './icons';

/** A point of a polygon, game px. */
export interface Point {
  x: number;
  y: number;
}

/** Outline of a rounded rectangle, clockwise from the top-left corner; each corner sampled with `segments` steps. */
export function roundedRectPoints(left: number, top: number, w: number, h: number, r: number, segments: number): Point[] {
  const out: Point[] = [];
  const corners: Array<[number, number, number]> = [
    [left + r, top + r, Math.PI],
    [left + w - r, top + r, Math.PI * 1.5],
    [left + w - r, top + h - r, 0],
    [left + r, top + h - r, Math.PI * 0.5],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= segments; i++) {
      const a = start + (Math.PI / 2) * (i / segments);
      out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  }
  return out;
}

/** Cuts a convex polygon by a line: keeps the part with `axis` ≤ `limit` (`below`) or ≥ `limit` (`above`). */
export function clipPolygon(points: readonly Point[], axis: 'x' | 'y', limit: number, keep: 'below' | 'above'): Point[] {
  const out: Point[] = [];
  const inside = (p: Point): boolean => (keep === 'below' ? p[axis] <= limit : p[axis] >= limit);
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const aIn = inside(a);
    if (aIn) out.push(a);
    if (aIn !== inside(b)) {
      const t = (limit - a[axis]) / (b[axis] - a[axis]);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** Area of a polygon (shoelace), game px². */
export function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export interface GoldFillStyle {
  top: number;
  bottom: number;
  bands: number;
  arcSegments: number;
}

/**
 * Gold filling a rounded button face from the left (docs/BUILD-BUTTON.md BB-5): `share` of the width, a straight
 * right edge, the corners of the face. A top-to-bottom gradient in bands, painted bottom up and overlapping, so
 * no seams show. Allocates a few small arrays: call it only when the share changes.
 */
export function drawGoldFill(
  g: Phaser.GameObjects.Graphics,
  left: number,
  top: number,
  w: number,
  h: number,
  r: number,
  share: number,
  style: GoldFillStyle,
): void {
  if (share <= 0) return;
  let shape = roundedRectPoints(left, top, w, h, r, style.arcSegments);
  if (share < 1) shape = clipPolygon(shape, 'x', left + w * share, 'below');
  for (let i = 0; i < style.bands; i++) {
    const k = style.bands === 1 ? 0 : i / (style.bands - 1);
    const band = i === 0 ? shape : clipPolygon(shape, 'y', top + h * (1 - i / style.bands), 'below');
    // fillPoints only reads x and y; the typings ask for full Vector2s.
    if (band.length >= 3) g.fillStyle(mixColor(style.bottom, style.top, k), 1).fillPoints(band as Phaser.Math.Vector2[], true);
  }
}
