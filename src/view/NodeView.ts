import * as Phaser from 'phaser';
import { TICK_MS } from '../config/balance';
import { COLORS, NODE_FX, NODE_LIP, NODE_VIEW, SHIELD_FX } from '../config/game';
import { visibleTroops } from '../core/sim/commands';
import { nodeCapacity } from '../core/sim/economy';
import type { NodeState, Owner } from '../core/sim/World';
import { BakedGraphics } from './BakedGraphics';
import { DisplayFilter } from './displayFilter';
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

/**
 * A node drawn with Graphics: faction circle, building badge, gold vein, troop count. Redraws only on change.
 * The owner and the count go through a DisplayFilter (PLAYTEST-1 F-2): they don't flicker while units pour in.
 * The body and the capacity arc are drawn off the display list and baked into the node's own textures
 * (view/BakedGraphics.ts, docs/PERF.md PF-5, PF-3): Phaser 4 rebuilds every Graphics each frame, an Image costs
 * nothing. They are re-baked only when they change.
 */
export class NodeView extends Phaser.GameObjects.Container {
  readonly nodeId: string;
  /** Start castle of a side: drawn with a crown whoever owns it now. */
  readonly capital: boolean;
  /** The evil mage's tower (TUTORIAL.md T-7): a purple tower rises behind the circle. */
  readonly mageTower: boolean;
  radius = 0;
  hitRadius = 0;

  /** Circle, badges, crown: baked (PF-5). */
  private readonly bodyArt: BakedGraphics;
  /**
   * The body and the capacity arc in their own container: the effects of docs/FX.md scale and shift it (FX-1), while
   * `pop()` tweens the node container itself, so the two never overwrite each other. The count stays outside.
   */
  private readonly layer: Phaser.GameObjects.Container;
  /** Breathing phase, random per node, so the nodes breathe out of step. */
  private readonly breathPhase = Math.random() * Math.PI * 2;
  /** White circle over the body, shown while it flashes (FX-2); its texture is one per radius. */
  private readonly flash: Phaser.GameObjects.Image;
  /** When the last squash, flash, count jump and tremble started (scene ms); a new one restarts it (max, not sum). */
  private punchAt = -Infinity;
  private flashAt = -Infinity;
  private countPopAt = -Infinity;
  private trembleAt = -Infinity;
  /** The count is scaled / the layer is shifted right now (reset once when the effect ends). */
  private countPopped = false;
  private trembling = false;
  /** Last spark burst from this node (rate limit, FX-2). */
  lastSparksAt = -Infinity;
  /** `released` of the node as of the last frame (FX-3): a release shows when it grows. */
  releasedSeen = 0;
  private readonly ring: Phaser.GameObjects.Graphics;
  /** Capacity arc around the circle: how full the node is. Baked at each of its 48 steps (PF-3). */
  private readonly cap: BakedGraphics;
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
  /** What the node shows (owner, count); the real state is in the world. */
  readonly shown: DisplayFilter;

  constructor(scene: Phaser.Scene, node: NodeState, capital = false, mageTower = false) {
    super(scene, 0, 0);
    this.nodeId = node.id;
    this.capital = capital;
    this.mageTower = mageTower;
    this.shown = new DisplayFilter(node.owner, visibleTroops(node.troops), NODE_VIEW.refreshMs, NODE_VIEW.ownerStableMs);
    this.ring = scene.add.graphics();
    this.cap = new BakedGraphics(scene, `node-cap-${node.id}`, NODE_VIEW.bakeSupersample);
    this.bodyArt = new BakedGraphics(scene, `node-body-${node.id}`, NODE_VIEW.bakeSupersample);
    this.countText = scene.add.text(0, 0, '', textStyle(18)).setOrigin(0.5);
    this.capText = scene.add.text(0, 0, '', textStyle(15)).setOrigin(0.5).setVisible(false);
    this.shieldGfx = scene.add.graphics();
    this.flash = scene.add.image(0, 0, '__WHITE').setVisible(false);
    this.layer = scene.make.container({}, false);
    this.layer.add([this.cap.image, this.bodyArt.image, this.flash]);
    this.add([this.ring, this.layer, this.countText, this.capText, this.shieldGfx]);
    scene.add.existing(this);
  }

  /**
   * Per-frame node effects (docs/FX.md), from the scene time `now`, ms. Off (`fx` false: dev `?perf=nofx`) the layer
   * stays at rest.
   */
  animate(now: number, fx: boolean): void {
    if (!fx) return;
    const breath = 1 + NODE_FX.breathAmp * Math.sin((NODE_FX.breathSpeed * now) / 1000 + this.breathPhase);
    const punch = fade(now - this.punchAt, NODE_FX.punchMs);
    this.layer.setScale(breath * (1 - NODE_FX.punch * punch));

    const tremble = fade(now - this.trembleAt, NODE_FX.trembleMs);
    if (tremble > 0) {
      const amp = px(NODE_FX.tremblePx) * tremble;
      this.layer.setPosition((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
      this.trembling = true;
    } else if (this.trembling) {
      this.layer.setPosition(0, 0);
      this.trembling = false;
    }

    const flash = fade(now - this.flashAt, NODE_FX.flashMs);
    if (flash > 0) this.flash.setVisible(true).setAlpha(NODE_FX.flashAlpha * flash);
    else if (this.flash.visible) this.flash.setVisible(false);

    const pop = fade(now - this.countPopAt, NODE_FX.countPopMs);
    if (pop > 0) {
      this.countText.setScale(1 + NODE_FX.countPop * pop);
      this.countPopped = true;
    } else if (this.countPopped) {
      this.countText.setScale(1);
      this.countPopped = false;
    }
  }

  /** A unit left the node (FX-3): squash and white flash; overlapping releases restart them (max, not sum). */
  release(now: number): void {
    this.punchAt = now;
    this.flashAt = now;
  }

  /** A unit hit the node (FX-2): squash, white flash, the count jumps; an own node also trembles. */
  hit(now: number, own: boolean): void {
    this.punchAt = now;
    this.flashAt = now;
    this.countPopAt = now;
    if (own) this.trembleAt = now;
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
    this.flash.setTexture(flashTexture(this.scene, this.radius));
    this.drawnKey = '';
    this.drawnCapKey = '';
    this.drawnShield = false;
    this.drawHighlight();
    this.shown.reset(node.owner, visibleTroops(node.troops));
    this.releasedSeen = node.released;
    this.sync(node, 0);
  }

  /**
   * Updates visuals from state; cheap when nothing changed. `now`: scene time, ms.
   * Returns the DisplayFilter bits (SHOWN_OWNER_CHANGED: the color just changed on screen).
   */
  sync(node: NodeState, now: number): number {
    const changed = this.shown.update(now, node.owner, visibleTroops(node.troops));
    const owner = this.shown.owner;
    const key = `${owner}|${node.kind}|${node.size}|${node.building?.type ?? '-'}|${node.building?.level ?? 0}|${node.hasGoldVein}|${this.radius}`;
    if (key !== this.drawnKey) {
      this.drawnKey = key;
      this.drawBody(node, owner);
    }
    const troops = this.shown.troops;
    if (troops !== this.drawnCount) {
      this.drawnCount = troops;
      this.countText.setText(String(troops));
    }
    this.syncCapacity(node, owner, troops);
    this.syncShield(node);
    return changed;
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
  private syncCapacity(node: NodeState, owner: Owner, troops: number): void {
    const owned = owner !== 'neutral';
    const capacity = nodeCapacity(node);
    // The shown count, so the arc moves with the number (and as rarely).
    const fill = Math.min(1, troops / capacity);
    const over = troops > capacity + 1e-9;
    // Quantized so the arc redraws a few dozen times while filling, not every frame.
    const showCap = owned && this.highlight === 'selected';
    const key = owned ? `${Math.round(fill * 48)}|${over}|${capacity}|${this.radius}|${showCap}` : 'neutral';
    if (key === this.drawnCapKey) return;
    this.drawnCapKey = key;

    const r = this.radius;
    const g = this.cap.graphics;
    g.clear();
    this.capText.setVisible(showCap);
    if (!owned) {
      this.cap.bake(this.x, this.y, { left: 0, right: 0, top: 0, bottom: 0 });
      return;
    }

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
    // The ring and a line width of margin around it.
    const reach = arcR + width;
    this.cap.bake(this.x, this.y, { left: reach, right: reach, top: reach, bottom: reach });
  }

  setHighlight(highlight: Highlight): void {
    if (highlight === this.highlight) return;
    this.highlight = highlight;
    this.drawHighlight();
  }

  private drawBody(node: NodeState, owner: Owner): void {
    const g = this.bodyArt.graphics;
    const r = this.radius;
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
    // Rim exactly under the outline; the face sits a bit higher inside it (no ground showing at the top edge).
    g.fillStyle(rim, 1).fillCircle(0, 0, r);
    g.fillStyle(COLORS.faction[owner], 1).fillCircle(0, -r * NODE_LIP, r * (1 - NODE_LIP));
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

    const B = NODE_VIEW.bodyBox;
    const pad = px(B.pad);
    const side = r * B.side + pad;
    this.bodyArt.bake(this.x, this.y, { left: side, right: side, top: r * (this.mageTower ? B.mageTop : B.top) + pad, bottom: r * B.bottom + pad });
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
    // The images went with the container; the drawings and textures are the node's own.
    this.bodyArt.destroy();
    this.cap.destroy();
  }
}

/** 0..1: 1 when an effect just started, fading linearly to 0 after `ms`. */
function fade(elapsed: number, ms: number): number {
  return elapsed < ms ? 1 - Math.max(0, elapsed) / ms : 0;
}

/** A white disc of radius r (the node's flash, FX-2), baked once per radius at layout time. */
function flashTexture(scene: Phaser.Scene, r: number): string {
  const radius = Math.round(r);
  const key = `node-flash-${radius}`;
  if (!scene.textures.exists(key)) {
    const size = radius * 2 + 2;
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillCircle(size / 2, size / 2, radius);
    g.generateTexture(key, size, size);
    g.destroy();
  }
  return key;
}

/**
 * The evil mage's tower as on the field, fitted in a box of `size` centered on (0, 0) of `g`: the tower behind an
 * enemy node (the mage card before level 10, PLAYTEST-1 F-8).
 */
export function drawMagePicture(g: Phaser.GameObjects.Graphics, size: number): void {
  // From the roof's star (2.6 r above the center) to the node's bottom (1 r below): 3.6 r, centered.
  const r = size / 3.7;
  g.setY(g.y + r * 0.8);
  drawMageTower(g, r);
  g.fillStyle(COLORS.factionDark.enemy, 1).fillCircle(0, 0, r);
  g.fillStyle(COLORS.faction.enemy, 1).fillCircle(0, -r * NODE_LIP, r * (1 - NODE_LIP));
  g.lineStyle(Math.max(2, r * 0.09), COLORS.outline, 1).strokeCircle(0, 0, r);
  g.fillStyle(0xffffff, 0.28).fillEllipse(-r * 0.3, -r * 0.45, r * 0.8, r * 0.38);
}

/** Purple wizard tower behind a node of radius r: body, pointed roof, a star on the tip and a lit window. */
export function drawMageTower(g: Phaser.GameObjects.Graphics, r: number): void {
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
