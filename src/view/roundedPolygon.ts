/** A point as the icon code keeps it: [x, y]. */
export type Vertex = readonly [number, number];

/**
 * Outline of a polygon whose corners are replaced by arcs of radius `r`, each sampled with `segments` steps.
 * Fill and stroke both use these points, so they follow the same rounded contour. The radius shrinks where an
 * edge is too short for it (the arcs of two corners never cross). Pure, no Phaser.
 */
export function roundedPolygon(points: readonly Vertex[], r: number, segments: number): Vertex[] {
  const n = points.length;
  if (r <= 0 || n < 3) return [...points];
  const out: Vertex[] = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = points[i]!;
    const [ax, ay] = points[(i + n - 1) % n]!;
    const [bx, by] = points[(i + 1) % n]!;
    const la = Math.hypot(ax - px, ay - py);
    const lb = Math.hypot(bx - px, by - py);
    const ux = (ax - px) / la;
    const uy = (ay - py) / la;
    const vx = (bx - px) / lb;
    const vy = (by - py) / lb;
    const angle = Math.acos(Math.min(1, Math.max(-1, ux * vx + uy * vy)));
    const tanHalf = Math.tan(angle / 2);
    // Distance from the corner to where the arc meets each edge; at most half of the shorter edge.
    const d = Math.min(r / tanHalf, la / 2, lb / 2);
    const radius = d * tanHalf;
    const bl = Math.hypot(ux + vx, uy + vy);
    const toCenter = radius / Math.sin(angle / 2);
    const cx = px + ((ux + vx) / bl) * toCenter;
    const cy = py + ((uy + vy) / bl) * toCenter;
    const a1 = Math.atan2(py + uy * d - cy, px + ux * d - cx);
    const a2 = Math.atan2(py + vy * d - cy, px + vx * d - cx);
    let sweep = a2 - a1;
    if (sweep > Math.PI) sweep -= Math.PI * 2;
    if (sweep < -Math.PI) sweep += Math.PI * 2;
    for (let k = 0; k <= segments; k++) {
      const a = a1 + (sweep * k) / segments;
      out.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
    }
  }
  return out;
}
