import * as Phaser from 'phaser';
import { TICK_MS } from '../config/balance';
import { BROKEN_STREAM_FX, CAPTURE_FX, COLORS, NODE_FX, NODE_LIP, NODE_VIEW, SHIELD_FX } from '../config/game';
import { visibleTroops } from '../core/sim/commands';
import { nodeCapacity } from '../core/sim/economy';
import { isAttacked, type NodeState, type Owner, type World } from '../core/sim/World';
import { BakedGraphics } from './BakedGraphics';
import { easeOutCubic } from './CaptureRings';
import { DisplayFilter, SHOWN_OWNER_CHANGED } from './displayFilter';
import { drawBuilding, drawCrown, drawKind } from './icons';
import { px, textStyle, type Point, type ScreenLayout } from './layout';

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
  /** Red dashed ring of a stream cut off by an attack (FX-6), its texture one per radius; hidden otherwise. */
  private readonly brokenRing: Phaser.GameObjects.Image;
  /** The node's stream count as of the last frame; when the ring appeared and until when the attack held it. */
  private streamsSeen = 0;
  private brokenAt = -Infinity;
  private brokenHeld = -Infinity;
  /** Battle effects on (docs/FX.md; off with the dev flag `?perf=nofx`). */
  fx = false;
  /**
   * Direction from the node towards where the unit that captured it came from, radians (set by the scene on a
   * capture by the player); the recolor wave starts on that side (FX-7). Used once.
   */
  captureAngle: number | null = null;
  /** The recolor wave (FX-7): the body keeps the old owner until it ends; the new colors are drawn in `waveGfx`. */
  private waveFrom: Owner | null = null;
  private waveAt = -Infinity;
  private waveAngle = 0;
  private readonly waveGfx: Phaser.GameObjects.Graphics;
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
    this.brokenRing = scene.add.image(0, 0, '__WHITE').setVisible(false);
    this.layer = scene.make.container({}, false);
    this.waveGfx = scene.add.graphics().setVisible(false);
    this.layer.add([this.cap.image, this.bodyArt.image, this.waveGfx, this.flash]);
    this.add([this.ring, this.layer, this.brokenRing, this.countText, this.capText, this.shieldGfx]);
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

    const B = BROKEN_STREAM_FX;
    const ringFade = now <= this.brokenHeld ? 1 : fade(now - this.brokenHeld, B.fadeMs);
    if (ringFade > 0 && now >= this.brokenAt) {
      const t = (now - this.brokenAt) / 1000;
      this.brokenRing
        .setVisible(true)
        .setRotation(((now - this.brokenAt) / B.turnMs) * Math.PI * 2)
        .setAlpha((B.pulseBase + B.pulseAmp * Math.sin(B.pulseSpeed * t)) * ringFade);
    } else if (this.brokenRing.visible) {
      this.brokenRing.setVisible(false);
    }

    if (this.waveFrom !== null) {
      this.drawWave(easeOutCubic(Math.min(1, (now - this.waveAt) / CAPTURE_FX.waveMs)));
    } else if (this.waveGfx.visible) {
      this.waveGfx.clear().setVisible(false);
    }

    const pop = fade(now - this.countPopAt, NODE_FX.countPopMs);
    if (pop > 0) {
      this.countText.setScale(1 + NODE_FX.countPop * pop);
      this.countPopped = true;
    } else if (this.countPopped) {
      this.countText.setScale(1);
      this.countPopped = false;
    }
  }

  /**
   * The "stream broken" ring of an own node (FX-6), from the world each frame: the node streamed last frame, streams
   * no more and is attacked — the attack cut the stream off (the rest stayed home). A stream that simply ran out
   * shows nothing. The ring stays while the node is attacked, at least BROKEN_STREAM_FX.minMs.
   */
  syncBrokenStream(world: World, node: NodeState, now: number): void {
    const before = this.streamsSeen;
    this.streamsSeen = node.streams;
    const own = node.owner === 'player';
    if (own && before > 0 && node.streams === 0 && isAttacked(world, node)) {
      this.brokenAt = now;
      this.brokenHeld = now + BROKEN_STREAM_FX.minMs;
    } else if (this.brokenRing.visible && own && isAttacked(world, node)) {
      this.brokenHeld = Math.max(this.brokenHeld, now);
    }
  }

  /**
   * The player's colors spreading over the circle (FX-7): the rim and the face, each cut by a circle growing from the
   * rim on the attacker's side to twice the radius (`e` 0..1), and the outline over them. Icons and the shine wait
   * under it until the body is re-baked at the end.
   */
  private drawWave(e: number): void {
    const g = this.waveGfx;
    const r = this.radius;
    const bx = Math.cos(this.waveAngle) * r;
    const by = Math.sin(this.waveAngle) * r;
    const grow = e * 2 * r;
    g.clear().setVisible(true);
    fillLens(g, 0, 0, r, bx, by, grow, COLORS.factionDark.player);
    fillLens(g, 0, -r * NODE_LIP, r * (1 - NODE_LIP), bx, by, grow, COLORS.faction.player);
    g.lineStyle(Math.max(2, r * 0.09), COLORS.outline, 1).strokeCircle(0, 0, r);
  }

  /** Screen point of the building badge's center (where a tower's arrows leave, docs/TOWER.md TW-4). */
  badgePoint(out: Point): Point {
    out.x = this.x + this.radius * BADGE_OFFSET;
    out.y = this.y - this.radius * BADGE_OFFSET;
    return out;
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
    this.brokenRing.setTexture(brokenRingTexture(this.scene, this.radius));
    this.drawnKey = '';
    this.drawnCapKey = '';
    this.drawnShield = false;
    this.waveFrom = null;
    this.captureAngle = null;
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
    // A capture by the player shows as a wave (FX-7): the body keeps the old owner until it has passed.
    if (changed & SHOWN_OWNER_CHANGED) {
      this.waveFrom = this.fx && owner === 'player' && this.captureAngle !== null ? this.shown.previousOwner : null;
      this.waveAt = now;
      this.waveAngle = this.captureAngle ?? 0;
      this.captureAngle = null;
    }
    if (this.waveFrom !== null && now - this.waveAt >= CAPTURE_FX.waveMs) this.waveFrom = null;
    const bodyOwner = this.waveFrom ?? owner;
    const key = `${bodyOwner}|${node.kind}|${node.size}|${node.building?.type ?? '-'}|${node.building?.level ?? 0}|${node.hasGoldVein}|${this.radius}`;
    if (key !== this.drawnKey) {
      this.drawnKey = key;
      this.drawBody(node, bodyOwner);
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
      const bx = r * BADGE_OFFSET;
      const by = -r * BADGE_OFFSET;
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

/** Fills the part of circle A (center ax, ay, radius ra) inside circle B (bx, by, rb): the lens between two arcs. */
function fillLens(g: Phaser.GameObjects.Graphics, ax: number, ay: number, ra: number, bx: number, by: number, rb: number, color: number): void {
  if (rb <= 0) return;
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  g.fillStyle(color, 1);
  if (d + ra <= rb) {
    g.fillCircle(ax, ay, ra);
    return;
  }
  if (d >= ra + rb) return;
  if (d + rb <= ra) {
    g.fillCircle(bx, by, rb);
    return;
  }
  const phi = Math.atan2(dy, dx);
  const alpha = Math.acos((d * d + ra * ra - rb * rb) / (2 * d * ra));
  const beta = Math.acos((d * d + rb * rb - ra * ra) / (2 * d * rb));
  g.beginPath();
  g.arc(ax, ay, ra, phi - alpha, phi + alpha);
  g.arc(bx, by, rb, phi + Math.PI - beta, phi + Math.PI + beta);
  g.closePath();
  g.fillPath();
}

/** The building badge sits this share of the radius right of and above the center. */
const BADGE_OFFSET = 0.72;

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

/** The red dashed ring of a broken stream (FX-6) around a node of radius r, baked once per radius at layout time. */
function brokenRingTexture(scene: Phaser.Scene, r: number): string {
  const B = BROKEN_STREAM_FX;
  const radius = Math.round(r + px(B.gapPx));
  const key = `node-broken-${radius}`;
  if (!scene.textures.exists(key)) {
    const width = px(B.widthPx);
    const size = Math.ceil(radius * 2 + width + 4);
    const c = size / 2;
    // Whole dashes around the circle: dash and gap stretched a little to close the ring.
    const dashes = Math.max(4, Math.round((Math.PI * 2 * radius) / px(B.dashPx + B.dashGapPx)));
    const step = (Math.PI * 2) / dashes;
    const dash = (step * B.dashPx) / (B.dashPx + B.dashGapPx);
    const g = scene.make.graphics({}, false);
    g.lineStyle(width, COLORS.faction.enemy, 1);
    for (let i = 0; i < dashes; i++) {
      g.beginPath();
      g.arc(c, c, radius, i * step, i * step + dash);
      g.strokePath();
    }
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
