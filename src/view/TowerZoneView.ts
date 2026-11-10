import * as Phaser from 'phaser';
import { BUILDINGS } from '../config/balance';
import { COLORS, TOWER_ZONE } from '../config/game';
import type { Owner, World } from '../core/sim/World';
import { px, type ScreenLayout } from './layout';
import { roadEdgeWidth } from './RoadView';

/**
 * Tower zones on the roads (docs/TOWER.md TW-3, variant «А · Полоса»): on every road of a node with a tower, a
 * translucent band of the owner's color exactly as wide as the road with its edge, from under the node's circle to
 * BUILDINGS.tower.zone from its center (as a share of the road, so it stays exact on a stretched field) (on a short road, no farther than the neighbour's circle), and a tick across
 * the road at the zone border. Portal links are not roads: no zone there.
 * Like the roads, it is drawn off the display list and baked into the ground texture (docs/PERF.md PF-G); the
 * battle re-bakes only when a tower is built, a node with a tower shows a new owner, or the layout changes.
 */
export class TowerZoneView {
  readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.make.graphics({}, false);
  }

  /**
   * Draws the zones of every tower. `ownerOf` gives the owner a node shows (its DisplayFilter, PLAYTEST-1 F-2), so
   * a zone does not blink while the node changes hands quickly.
   */
  draw(world: World, layout: ScreenLayout, ownerOf: (nodeId: string) => Owner): void {
    const g = this.graphics;
    g.clear();
    const band = roadEdgeWidth(layout);
    const tick = px(TOWER_ZONE.tickWidthPx);
    for (const [a, b] of world.roads) {
      for (const [id, other] of [
        [a, b],
        [b, a],
      ] as const) {
        const node = world.nodes[id]!;
        if (node.building?.type !== 'tower') continue;
        const owner = ownerOf(id);
        const neighbour = world.nodes[other]!;
        const c = layout.toScreen(node.x, node.y);
        const m = layout.toScreen(neighbour.x, neighbour.y);
        const length = Math.hypot(m.x - c.x, m.y - c.y);
        if (length <= 0) continue;
        const ux = (m.x - c.x) / length;
        const uy = (m.y - c.y) / length;
        const fieldLength = Math.hypot(neighbour.x - node.x, neighbour.y - node.y);
        const zone = fieldLength > 0 ? (BUILDINGS.tower.zone / fieldLength) * length : 0;
        const r = layout.nodeRadius(node.size);
        const from = r * TOWER_ZONE.startOfRadius;
        const to = Math.min(zone, length - layout.nodeRadius(neighbour.size));
        // The whole zone is under the circle: nothing to show.
        if (to <= r) continue;
        const ex = c.x + ux * to;
        const ey = c.y + uy * to;
        g.lineStyle(band, COLORS.faction[owner], TOWER_ZONE.bandAlpha);
        g.lineBetween(c.x + ux * from, c.y + uy * from, ex, ey);
        // The tick across the road at the zone border, as long as the road is wide, with round ends.
        const half = band / 2;
        const color = COLORS.factionDark[owner];
        g.lineStyle(tick, color, 1);
        g.lineBetween(ex - uy * half, ey + ux * half, ex + uy * half, ey - ux * half);
        g.fillStyle(color, 1);
        g.fillCircle(ex - uy * half, ey + ux * half, tick / 2);
        g.fillCircle(ex + uy * half, ey - ux * half, tick / 2);
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
