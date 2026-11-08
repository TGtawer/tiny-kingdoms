import type * as Phaser from 'phaser';
import { FX_COLORS, VICTORY_FX } from '../config/game';
import { pop } from './effects';
import { px } from './layout';
import type { NodeView } from './NodeView';
import type { ParticleBursts } from './ParticleBursts';

/**
 * The victory wave (docs/FX.md FX-9): a light circle spreads over the field from the player's capital before the
 * result panel; every node it reaches pops and throws a little confetti. One Graphics made with the scene, drawn
 * only while the wave runs (it is over before the panel shows).
 */
export class VictoryWave {
  private readonly g: Phaser.GameObjects.Graphics;
  private startedAt = -Infinity;
  private x = 0;
  private y = 0;
  /** Radius that reaches the farthest node's rim. */
  private reach = 0;
  private views: NodeView[] = [];
  private touched: boolean[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
    private readonly confetti: ParticleBursts,
  ) {
    this.g = scene.add.graphics().setDepth(depth).setVisible(false);
  }

  /** Starts the wave from `origin` over `views`. */
  start(origin: NodeView, views: readonly NodeView[], now: number): void {
    this.startedAt = now;
    this.x = origin.x;
    this.y = origin.y;
    this.views = [...views];
    this.touched = this.views.map(() => false);
    this.reach = 0;
    for (const v of this.views) this.reach = Math.max(this.reach, Math.hypot(v.x - this.x, v.y - this.y) + v.radius);
  }

  update(now: number): void {
    if (this.startedAt === -Infinity) return;
    const t = (now - this.startedAt) / VICTORY_FX.waveMs;
    const g = this.g;
    if (t >= 1) {
      g.clear().setVisible(false);
      this.startedAt = -Infinity;
      return;
    }
    const r = this.reach * t;
    g.clear().setVisible(true);
    g.fillStyle(FX_COLORS.factionLight.player, VICTORY_FX.fillAlpha * (1 - t)).fillCircle(this.x, this.y, r);
    g.lineStyle(px(VICTORY_FX.lineWidthPx), FX_COLORS.factionLight.player, VICTORY_FX.lineAlpha * (1 - t)).strokeCircle(this.x, this.y, r);
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i]!;
      if (this.touched[i] || Math.hypot(v.x - this.x, v.y - this.y) > r) continue;
      this.touched[i] = true;
      pop(this.scene, v);
      this.confetti.burst(v.x, v.y, 0, VICTORY_FX.confetti, VICTORY_FX.confettiColors);
    }
  }
}
