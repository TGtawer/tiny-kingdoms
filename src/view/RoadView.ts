import * as Phaser from 'phaser';
import { COLORS } from '../config/game';
import type { World } from '../core/sim/World';
import { px, type ScreenLayout } from './layout';

/** All roads in a single Graphics object; redrawn only on layout change. */
export class RoadView {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics();
  }

  draw(world: World, layout: ScreenLayout): void {
    const g = this.g;
    g.clear();
    const width = Math.max(px(8), layout.scale * 0.016);
    const segments = world.roads.map(([a, b]) => {
      const na = world.nodes[a]!;
      const nb = world.nodes[b]!;
      return [layout.toScreen(na.x, na.y), layout.toScreen(nb.x, nb.y)] as const;
    });

    // Edge first, then the sandy surface on top, then dashes down the middle.
    g.lineStyle(width + px(5), COLORS.roadEdge, 1);
    for (const [p, q] of segments) g.lineBetween(p.x, p.y, q.x, q.y);
    for (const [p] of segments) g.fillStyle(COLORS.roadEdge, 1).fillCircle(p.x, p.y, (width + px(5)) / 2);
    g.lineStyle(width, COLORS.road, 1);
    for (const [p, q] of segments) g.lineBetween(p.x, p.y, q.x, q.y);

    const dash = px(7);
    const gap = px(9);
    g.lineStyle(Math.max(1, width * 0.18), COLORS.roadEdge, 0.55);
    for (const [p, q] of segments) {
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const ux = (q.x - p.x) / len;
      const uy = (q.y - p.y) / len;
      for (let t = gap; t + dash < len - gap; t += dash + gap) {
        g.lineBetween(p.x + ux * t, p.y + uy * t, p.x + ux * (t + dash), p.y + uy * (t + dash));
      }
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
