import { describe, expect, it } from 'vitest';
import { clipPolygon, polygonArea, roundedRectPoints } from '../../src/view/goldFill';

/** Exact area of a rounded rectangle. */
const roundedArea = (w: number, h: number, r: number): number => w * h - (4 - Math.PI) * r * r;

describe('gold fill shape (BUILD-BUTTON BB-5)', () => {
  const face = roundedRectPoints(-60, -30, 120, 60, 16, 24);

  it('follows the rounded face', () => {
    expect(polygonArea(face)).toBeCloseTo(roundedArea(120, 60, 16), -1);
    for (const p of face) {
      expect(p.x).toBeGreaterThanOrEqual(-60 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(60 + 1e-9);
    }
  });

  it('a cut at 40% keeps the left part, inside the face, with a straight right edge', () => {
    const part = clipPolygon(face, 'x', -60 + 120 * 0.4, 'below');
    // The left rounded corners stay, the cut adds a straight edge: area = 48 x 60 minus the two left corners.
    expect(polygonArea(part)).toBeCloseTo(48 * 60 - ((4 - Math.PI) / 2) * 16 * 16, 0);
    expect(Math.max(...part.map((p) => p.x))).toBeCloseTo(-12);
  });

  it('a cut narrower than the corner radius stays inside the corners', () => {
    const part = clipPolygon(face, 'x', -55, 'below');
    expect(part.length).toBeGreaterThanOrEqual(3);
    expect(polygonArea(part)).toBeLessThan(5 * 60);
    for (const p of part) expect(p.y).toBeGreaterThan(-30 - 1e-9);
  });

  it('a cut past the right corners keeps their rounding', () => {
    const part = clipPolygon(face, 'x', 55, 'below');
    expect(polygonArea(part)).toBeLessThan(polygonArea(face));
    expect(polygonArea(part)).toBeGreaterThan(polygonArea(face) - 5 * 60);
  });

  it('a horizontal cut keeps the lower part', () => {
    const lower = clipPolygon(face, 'y', 0, 'above');
    expect(polygonArea(lower)).toBeCloseTo(polygonArea(face) / 2, 0);
  });
});
