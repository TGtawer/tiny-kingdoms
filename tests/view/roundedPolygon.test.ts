import { describe, expect, it } from 'vitest';
import { roundedPolygon, type Vertex } from '../../src/view/roundedPolygon';

const area = (pts: readonly Vertex[]): number =>
  Math.abs(pts.reduce((sum, [x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length]!;
    return sum + x * ny - nx * y;
  }, 0)) / 2;

/** The Play triangle of a 100 px icon box (as drawMenuIcon draws it). */
const play: Vertex[] = [
  [-28, -42],
  [44, 0],
  [-28, 42],
];

describe('rounded polygon (main menu Play icon)', () => {
  it('a square with rounded corners has the exact rounded-rectangle area', () => {
    const square: Vertex[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    expect(area(roundedPolygon(square, 10, 32))).toBeCloseTo(100 * 100 - (4 - Math.PI) * 100, 0);
  });

  it('rounds the Play triangle inside the sharp one, keeping most of it', () => {
    const sharp = area(play);
    const round = roundedPolygon(play, 12, 6);
    expect(area(round)).toBeLessThan(sharp);
    expect(area(round)).toBeGreaterThan(sharp * 0.85);
    // No point leaves the sharp triangle's box, and the tip is pulled in from x = 44.
    for (const [x, y] of round) {
      expect(x).toBeGreaterThanOrEqual(-28 - 1e-9);
      expect(Math.abs(y)).toBeLessThanOrEqual(42 + 1e-9);
    }
    expect(Math.max(...round.map(([x]) => x))).toBeLessThan(44);
  });

  it('the arcs meet the edges smoothly: no step between neighbour points is longer than an edge piece', () => {
    const round = roundedPolygon(play, 12, 6);
    expect(round).toHaveLength(3 * 7);
    for (let i = 0; i < round.length; i++) {
      const [x, y] = round[i]!;
      const [nx, ny] = round[(i + 1) % round.length]!;
      expect(Math.hypot(nx - x, ny - y)).toBeLessThan(84);
    }
  });

  it('a radius too big for an edge shrinks to fit; radius 0 keeps the polygon', () => {
    const round = roundedPolygon(play, 500, 6);
    expect(area(round)).toBeGreaterThan(0);
    expect(roundedPolygon(play, 0, 6)).toEqual(play);
  });
});
