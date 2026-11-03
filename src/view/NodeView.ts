import * as Phaser from 'phaser';
import { COLORS } from '../config/game';
import { visibleTroops } from '../core/sim/commands';
import type { NodeState } from '../core/sim/World';
import { drawBuilding } from './icons';
import { px, textStyle, type FieldLayout } from './layout';

export type Highlight = 'none' | 'selected' | 'target' | 'fireball' | 'reinforcement' | 'hint';

const HIGHLIGHT_COLOR: Record<Exclude<Highlight, 'none'>, number> = {
  selected: COLORS.select,
  target: COLORS.select,
  fireball: COLORS.fireball,
  reinforcement: COLORS.reinforcement,
  hint: COLORS.hint,
};

/** A node drawn with Graphics: faction circle, building badge, gold vein, troop count. Redraws only on change. */
export class NodeView extends Phaser.GameObjects.Container {
  readonly nodeId: string;
  radius = 0;
  hitRadius = 0;

  private readonly bodyGfx: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly countText: Phaser.GameObjects.Text;
  private drawnKey = '';
  private drawnCount = -1;
  private highlight: Highlight = 'none';
  private ringTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, node: NodeState) {
    super(scene, 0, 0);
    this.nodeId = node.id;
    this.ring = scene.add.graphics();
    this.bodyGfx = scene.add.graphics();
    this.countText = scene.add.text(0, 0, '', textStyle(18)).setOrigin(0.5);
    this.add([this.ring, this.bodyGfx, this.countText]);
    scene.add.existing(this);
  }

  /** Re-positions and resizes after a layout change. */
  place(node: NodeState, layout: FieldLayout): void {
    const p = layout.toScreen(node.x, node.y);
    this.setPosition(p.x, p.y);
    this.radius = layout.nodeRadius(node.size);
    this.hitRadius = layout.hitRadius(node.size);
    this.countText.setFontSize(Math.round(Math.max(px(15), this.radius * 0.72)));
    this.countText.setStroke('#1f2937', Math.max(2, this.radius * 0.14));
    this.drawnKey = '';
    this.drawHighlight();
    this.sync(node);
  }

  /** Updates visuals from state; cheap when nothing changed. */
  sync(node: NodeState): void {
    const key = `${node.owner}|${node.building?.type ?? '-'}|${node.building?.level ?? 0}|${node.hasGoldVein}|${this.radius}`;
    if (key !== this.drawnKey) {
      this.drawnKey = key;
      this.drawBody(node);
    }
    const troops = visibleTroops(node.troops);
    if (troops !== this.drawnCount) {
      this.drawnCount = troops;
      this.countText.setText(String(troops));
    }
  }

  setHighlight(highlight: Highlight): void {
    if (highlight === this.highlight) return;
    this.highlight = highlight;
    this.drawHighlight();
  }

  private drawBody(node: NodeState): void {
    const g = this.bodyGfx;
    const r = this.radius;
    const owner = node.owner;
    g.clear();

    // Shadow, rim, face, highlight crescent.
    g.fillStyle(0x000000, 0.18).fillEllipse(0, r * 0.82, r * 1.9, r * 0.6);
    g.fillStyle(COLORS.factionDark[owner], 1).fillCircle(0, r * 0.1, r);
    g.fillStyle(COLORS.faction[owner], 1).fillCircle(0, 0, r * 0.92);
    g.lineStyle(Math.max(2, r * 0.09), COLORS.outline, 1).strokeCircle(0, 0, r);
    g.fillStyle(0xffffff, 0.28).fillEllipse(-r * 0.3, -r * 0.45, r * 0.8, r * 0.38);

    // Gold vein: nuggets at the lower left.
    if (node.hasGoldVein) {
      const vx = -r * 0.78;
      const vy = r * 0.62;
      g.fillStyle(COLORS.goldDark, 1).fillCircle(vx, vy, r * 0.24);
      g.fillStyle(COLORS.gold, 1).fillCircle(vx - r * 0.05, vy - r * 0.04, r * 0.19);
      g.fillStyle(COLORS.gold, 1).fillCircle(vx + r * 0.2, vy + r * 0.1, r * 0.12);
    }

    // Building badge at the top right, with level pips.
    if (node.building) {
      const bx = r * 0.72;
      const by = -r * 0.72;
      const br = Math.max(px(13), r * 0.46);
      g.fillStyle(COLORS.panel, 1).fillCircle(bx, by, br);
      g.lineStyle(Math.max(1.5, br * 0.14), COLORS.outline, 1).strokeCircle(bx, by, br);
      drawBuilding(g, node.building.type, bx, by, br * 1.25);
      const pip = Math.max(px(3), br * 0.2);
      for (let i = 0; i < node.building.level; i++) {
        const px0 = bx + (i - (node.building.level - 1) / 2) * pip * 2.4;
        g.fillStyle(COLORS.gold, 1).fillCircle(px0, by + br + pip * 0.6, pip);
        g.lineStyle(Math.max(1, pip * 0.4), COLORS.outline, 1).strokeCircle(px0, by + br + pip * 0.6, pip);
      }
    }
  }

  private drawHighlight(): void {
    const g = this.ring;
    g.clear();
    this.ringTween?.stop();
    this.ringTween = null;
    g.setAlpha(1);
    if (this.highlight === 'none') return;

    const color = HIGHLIGHT_COLOR[this.highlight];
    const r = this.radius;
    g.lineStyle(Math.max(3, r * 0.14), color, 0.95).strokeCircle(0, 0, r * 1.22);
    if (this.highlight !== 'selected') {
      this.ringTween = this.scene.tweens.add({ targets: g, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });
    }
  }

  override destroy(fromScene?: boolean): void {
    this.ringTween?.stop();
    super.destroy(fromScene);
  }
}
