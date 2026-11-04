import { describe, expect, it } from 'vitest';
import { distToSegment, placeDecor, type DecorParams } from '../../../src/core/map/decor';

type Kind = 'tree' | 'pine' | 'bush' | 'house' | 'pond' | 'mill';

// A chapter-like path: 10 levels zig-zagging up a 360 x 1400 world.
const path = Array.from({ length: 10 }, (_, i) => ({ x: 180 + 110 * Math.sin(i * 1.1), y: 1300 - i * 118 }));

const params = (seed: number): DecorParams<Kind> => ({
  seed,
  path,
  nodeRadius: 36,
  nodeClearance: 22,
  roadClearance: 14,
  itemGap: 4,
  area: { x: 16, y: 70, width: 328, height: 1320 },
  kinds: [
    { kind: 'tree', radius: 14, weight: 5 },
    { kind: 'pine', radius: 13, weight: 4 },
    { kind: 'bush', radius: 9, weight: 3 },
    { kind: 'house', radius: 15, weight: 1.4 },
    { kind: 'pond', radius: 22, weight: 0.5, max: 2 },
    { kind: 'mill', radius: 18, weight: 0.35, max: 2 },
  ],
  count: 45,
  maxTries: 4000,
});

describe('map decor placement', () => {
  const items = placeDecor(params(1));

  it('fills the map', () => {
    expect(items.length).toBeGreaterThanOrEqual(40);
    expect(items.length).toBeLessThanOrEqual(45);
  });

  it('no item touches a level node or the road', () => {
    for (const d of items) {
      for (const n of path) expect(Math.hypot(n.x - d.x, n.y - d.y)).toBeGreaterThanOrEqual(36 + d.radius + 22);
      for (let i = 0; i + 1 < path.length; i++) expect(distToSegment(d.x, d.y, path[i]!, path[i + 1]!)).toBeGreaterThanOrEqual(d.radius + 14);
    }
  });

  it('items do not overlap each other', () => {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!;
        const b = items[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radius + b.radius + 4);
      }
    }
  });

  it('keeps the limits on ponds and mills, sorts by y', () => {
    expect(items.filter((d) => d.kind === 'pond').length).toBeLessThanOrEqual(2);
    expect(items.filter((d) => d.kind === 'mill').length).toBeLessThanOrEqual(2);
    for (let i = 1; i < items.length; i++) expect(items[i]!.y).toBeGreaterThanOrEqual(items[i - 1]!.y);
  });

  it('is deterministic per seed and differs between chapters', () => {
    expect(placeDecor(params(1))).toEqual(items);
    expect(placeDecor(params(2))).not.toEqual(items);
  });
});
