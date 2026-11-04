import * as Phaser from 'phaser';
import { TICK_MS } from '../config/balance';
import { COLORS, SHIELD_FX } from '../config/game';
import { visibleTroops } from '../core/sim/commands';
import { nodeCapacity } from '../core/sim/economy';
import type { NodeState } from '../core/sim/World';
import { drawBuilding, drawCrown, drawKind } from './icons';
import { px, textStyle, type ScreenLayout } from './layout';

export type Highlight = 'none' | 'selected' | 'target' | 'fireball' | 'reinforcement' | 'shield' | 'hint';

const HIGHLIGHT_COLOR: Record<Exclude<Highlight, 'none'>, number> = {
  selected: COLORS.select,
  target: COLORS.select,
  fireball: COLORS.fireball,
  reinforcement: COLORS.reinforcement,
  shield: COLORS.shield,
  hint: COLORS.hint,
};

/** A node drawn with Graphics: faction circle, building badge, gold vein, troop count. Redraws only on change. */
export class NodeView extends Phaser.GameObjects.Container {
  readonly nodeId: string;
  /** Start castle of a side: drawn with a crown whoever owns it now. */
  readonly capital: boolean;
  /** The evil mage's tower (TUTORIAL.md T-7): a purple tower rises behind the circle. */
  readonly mageTower: boolean;
  radius = 0;
  hitRadius = 0;

  private readonly bodyGfx: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  /** Capacity arc around the circle: how full the node is. */
  private readonly capGfx: Phaser.GameObjects.Graphics;
  private readonly countText: Phaser.GameObjects.Text;
  /** "/35" under the circle: capacity, shown only on the selected node. */
  private readonly capText: Phaser.GameObjects.Text;
  /** Translucent dome while the node is shielded. */
  private readonly shieldGfx: Phaser.GameObjects.Graphics;
  private drawnShield = false;
  private drawnKey = '';
  private drawnCount = -1;
  private drawnCapKey = '';
  private highlight: Highlight = 'none';
  private ringTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, node: NodeState, capital = false, mageTower = false) {
    super(scene, 0, 0);
    this.nodeId = node.id;
    this.capital = capital;
    this.mageTower = mageTower;
    this.ring = scene.add.graphics();
    this.capGfx = scene.add.graphics();
    this.bodyGfx = scene.add.graphics();
    this.countText = scene.add.text(0, 0, '', textStyle(18)).setOrigin(0.5);
    this.capText = scene.add.text(0, 0, '', textStyle(15)).setOrigin(0.5).setVisible(false);
    this.shieldGfx = scene.add.graphics();
    this.add([this.ring, this.capGfx, this.bodyGfx, this.countText, this.capText, this.shieldGfx]);
    scene.add.existing(this);
  }

  /** Re-positions and resizes after a layout change. */
  place(node: NodeState, layout: ScreenLayout): void {
    const p = layout.toScreen(node.x, node.y);
    this.setPosition(p.x, p.y);
    this.radius = layout.nodeRadius(node.size);
    this.hitRadius = layout.hitRadius(node.size);
    this.countText.setFontSize(Math.round(Math.max(px(15), this.radius * 0.66)));
    this.countText.setStroke('#1f2937', Math.max(2, this.radius * 0.14));
    this.capText.setStroke('#1f2937', px(4));
    this.drawnKey = '';
    this.drawnCapKey = '';
    this.drawnShield = false;
    this.drawHighlight();
    this.sync(node);
  }

  /** Updates visuals from state; cheap when nothing changed. */
  sync(node: NodeState): void {
    const key = `${node.owner}|${node.kind}|${node.size}|${node.building?.type ?? '-'}|${node.building?.level ?? 0}|${node.hasGoldVein}|${this.radius}`;
    if (key !== this.drawnKey) {
      this.drawnKey = key;
      this.drawBody(node);
    }
    const troops = visibleTroops(node.troops);
    if (troops !== this.drawnCount) {
      this.drawnCount = troops;
      this.countText.setText(String(troops));
    }
    this.syncCapacity(node);
    this.syncShield(node);
  }

  /** Dome drawn once when the shield goes up; blinks during its last moments. */
  private syncShield(node: NodeState): void {
    const on = node.shieldTicks > 0;
    if (on !== this.drawnShield) {
      this.drawnShield = on;
      const g = this.shieldGfx;
      g.clear();
      if (on) {
        const r = this.radius * SHIELD_FX.radius;
        g.fillStyle(COLORS.shield, SHIELD_FX.fillAlpha).fillCircle(0, 0, r);
        g.lineStyle(Math.max(px(3), this.radius * 0.12), COLORS.shield, 0.95).strokeCircle(0, 0, r);
        g.fillStyle(0xffffff, 0.45).fillEllipse(-r * 0.35, -r * 0.5, r * 0.6, r * 0.3);
      }
    }
    if (!on) return;
    const leftMs = node.shieldTicks * TICK_MS;
    this.shieldGfx.setAlpha(leftMs < SHIELD_FX.blinkMs && Math.floor(leftMs / 250) % 2 === 0 ? 0.35 : 1);
  }

  /**
   * Capacity arc for owned nodes, plus the "/max" label while selected (neutrals don't produce, so capacity means nothing there).
   * Full arc = production stopped; gold arc = above capacity (e.g. after reinforcements).
   */
  private syncCapacity(node: NodeState): void {
    const owned = node.owner !== 'neutral';
    const capacity = nodeCapacity(node);
    const fill = Math.min(1, node.troops / capacity);
    const over = node.troops > capacity + 1e-9;
    // Quantized so the arc redraws a few dozen times while filling, not every frame.
    const showCap = owned && this.highlight === 'selected';
    const key = owned ? `${Math.round(fill * 48)}|${over}|${capacity}|${this.radius}|${showCap}` : 'neutral';
    if (key === this.drawnCapKey) return;
    this.drawnCapKey = key;

    const r = this.radius;
    const g = this.capGfx;
    g.clear();
    this.capText.setVisible(showCap);
    if (!owned) return;

    this.capText.setText(`/${capacity}`).setY(r * 1.13 + px(12));
    const arcR = r * 1.13;
    const width = Math.max(px(3), r * 0.1);
    g.lineStyle(width, COLORS.outline, 0.3);
    g.beginPath().arc(0, 0, arcR, 0, Math.PI * 2).strokePath();
    if (fill > 0) {
      const start = -Math.PI / 2;
      g.lineStyle(width, over ? COLORS.gold : COLORS.select, 0.95);
      g.beginPath().arc(0, 0, arcR, start, start + fill * Math.PI * 2).strokePath();
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
    if (this.mageTower) drawMageTower(g, r);
    // Fortress: battlements around the rim.
    if (node.kind === 'fortress') {
      const merlon = r * 0.34;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const mx = Math.cos(a) * r * 1.02;
        const my = Math.sin(a) * r * 1.02;
        g.fillStyle(COLORS.factionDark[owner], 1).fillRect(mx - merlon / 2, my - merlon / 2, merlon, merlon);
        g.lineStyle(Math.max(1.5, r * 0.06), COLORS.outline, 1).strokeRect(mx - merlon / 2, my - merlon / 2, merlon, merlon);
      }
    }
    // Bandit camp: dark rim instead of the neutral one.
    const rim = node.kind === 'bandits' ? COLORS.bandits : COLORS.factionDark[owner];
    g.fillStyle(rim, 1).fillCircle(0, r * 0.1, r);
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

    // Special node badge at the bottom right.
    if (node.kind !== 'normal') {
      const kx = r * 0.74;
      const ky = r * 0.7;
      const kr = Math.max(px(12), r * 0.42);
      g.fillStyle(COLORS.panel, 1).fillCircle(kx, ky, kr);
      g.lineStyle(Math.max(1.5, kr * 0.14), node.kind === 'portal' ? COLORS.portal : COLORS.outline, 1).strokeCircle(kx, ky, kr);
      drawKind(g, node.kind, kx, ky, kr * 1.3);
    }

    // Capital crown at the top left (mirrors the building badge); the mage tower is its own landmark.
    if (this.capital && !this.mageTower) {
      const size = Math.max(px(18), r * 0.7);
      drawCrown(g, -r * 0.62, -r * 0.88, size);
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
    g.lineStyle(Math.max(3, r * 0.14), color, 0.95).strokeCircle(0, 0, r * 1.34);
    if (this.highlight !== 'selected') {
      this.ringTween = this.scene.tweens.add({ targets: g, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });
    }
  }

  override destroy(fromScene?: boolean): void {
    this.ringTween?.stop();
    super.destroy(fromScene);
  }
}

/** Purple wizard tower behind a node of radius r: body, pointed roof, a star on the tip and a lit window. */
function drawMageTower(g: Phaser.GameObjects.Graphics, r: number): void {
  const line = Math.max(2, r * 0.08);
  const bw = r * 0.78;
  const top = -r * 1.55;
  // Body.
  g.fillStyle(COLORS.mageDark, 1).fillRect(-bw / 2, top, bw, r * 1.2);
  g.lineStyle(line, COLORS.outline, 1).strokeRect(-bw / 2, top, bw, r * 1.2);
  // Roof.
  g.fillStyle(COLORS.mage, 1);
  g.beginPath();
  g.moveTo(-bw * 0.72, top + r * 0.05);
  g.lineTo(0, top - r * 1.05);
  g.lineTo(bw * 0.72, top + r * 0.05);
  g.closePath();
  g.fillPath();
  g.strokePath();
  // Star on the tip and a glowing window.
  g.fillStyle(COLORS.gold, 1).fillCircle(0, top - r * 1.05, r * 0.14);
  g.lineStyle(Math.max(1, line * 0.6), COLORS.outline, 1).strokeCircle(0, top - r * 1.05, r * 0.14);
  g.fillStyle(COLORS.hint, 1).fillRoundedRect(-r * 0.12, top + r * 0.22, r * 0.24, r * 0.3, r * 0.1);
}
