import type * as Phaser from 'phaser';
import { COLORS, MAP_FX } from '../config/game';
import { placeDecor } from '../core/map/decor';
import { cloudShadowTexture, cloudTexture, decorTexture, puffTexture, sailsTexture, shadowTexture, squadTexture, type Baked, type DecorKind } from './mapArt';
import { px, type Point } from './layout';

/** Draw order of the map layers (level nodes are at 0, the fixed UI at 100). */
export const MAP_DEPTH = { meadow: -10, ponds: -6, road: -5, dashes: -4.5, shadows: -4, decor: -3, walker: 1, token: 2, cloudShadows: 49, clouds: 50 } as const;

export interface SceneryOptions {
  chapter: number;
  /** Level node centers in world px, in level order. */
  points: readonly Point[];
  /** Completed levels in this chapter (levels open in order, so they are the first `done`). */
  done: number;
  nodeRadius: number;
  world: { width: number; height: number };
  /** Scroll axis of the map: vertical in portrait. */
  portrait: boolean;
  /** Visible band between the top bar and the bottom strip, screen px. */
  band: { top: number; bottom: number };
}

interface Swaying {
  sprite: Phaser.GameObjects.Image;
  phase: number;
}

interface Smoke {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  phase: number;
}

interface Cloud {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  /** Position along the drift (x) and the scroll axis, before parallax. */
  x: number;
  y: number;
  speed: number;
}

/**
 * The living chapter map around the level nodes (docs/VISUALS.md V-2): road walked and ahead with running
 * dashes, decor with small motion, the player token over the current level, a squad walking the completed
 * path and parallax clouds. Built once per layout; `update` only moves sprites and redraws the dash lines.
 * The level-open animation (V-3) drives it through setDone / revealRoad / moveToken / setQuiet.
 */
export class MapScenery {
  private readonly swaying: Swaying[] = [];
  private readonly sails: Swaying[] = [];
  private readonly smoke: Smoke[] = [];
  private readonly clouds: Cloud[] = [];
  private readonly walked: Phaser.GameObjects.Graphics;
  private readonly ahead: Phaser.GameObjects.Graphics;
  /** The segment being drawn by the level-open animation, over the dimmed road. */
  private readonly reveal: Phaser.GameObjects.Graphics;
  private dashes: Phaser.GameObjects.Graphics | null = null;
  private readonly token: { sprite: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; at: Point } | null = null;
  /** While set, the token is here instead of hopping in place (on its way to a new level). */
  private tokenOverride: { x: number; y: number; hop: number } | null = null;
  private walker: Phaser.GameObjects.Image | null = null;
  private quiet = false;
  private done: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly o: SceneryOptions,
  ) {
    this.done = o.done;
    this.walked = scene.add.graphics().setDepth(MAP_DEPTH.road);
    this.ahead = scene.add.graphics().setDepth(MAP_DEPTH.road);
    this.reveal = scene.add.graphics().setDepth(MAP_DEPTH.road + 0.1);
    if (MAP_FX.showRoadProgress) this.ahead.setAlpha(MAP_FX.road.futureAlpha);
    if (MAP_FX.showDecor) this.placeDecor();
    if (MAP_FX.showToken && o.points.length > 0) {
      const T = MAP_FX.token;
      const shadow = this.image(shadowTexture(scene), 0, 0).setTint(0x000000).setAlpha(T.shadowAlpha).setDepth(MAP_DEPTH.token);
      const sprite = this.image(squadTexture(scene, T.radius, 'player'), 0, 0).setDepth(MAP_DEPTH.token);
      this.token = { sprite, shadow, at: { x: 0, y: 0 } };
    }
    this.setDone(o.done);
    if (MAP_FX.showClouds) this.placeClouds();
  }

  /** Completed levels changed (end of the level-open animation): road, dashes, token and walker follow. */
  setDone(done: number): void {
    this.done = done;
    const { points } = this.o;
    this.drawRoad();
    this.reveal.clear();
    const dashed = MAP_FX.showRoadProgress && done >= 1 && done < points.length;
    if (dashed && !this.dashes) this.dashes = this.scene.add.graphics().setDepth(MAP_DEPTH.dashes);
    if (!dashed && this.dashes) {
      this.dashes.destroy();
      this.dashes = null;
    }
    if (this.token) this.token.at = points[Math.min(done, points.length - 1)]!;
    this.tokenOverride = null;
    if (MAP_FX.showWalker && done >= 2 && !this.walker) {
      this.walker = this.image(squadTexture(this.scene, MAP_FX.walker.radius, 'player'), 0, 0).setDepth(MAP_DEPTH.walker);
    }
    this.setQuiet(this.quiet);
  }

  /** Draws the road from level `index` toward the next one, share `k` of the way (opaque, over the dimmed part). */
  revealRoad(index: number, k: number): void {
    const a = this.o.points[index];
    const b = this.o.points[index + 1];
    const g = this.reveal;
    g.clear();
    if (!a || !b || k <= 0) return;
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k;
    const R = MAP_FX.road;
    for (const [width, color] of [
      [px(R.edgeWidth), COLORS.roadEdge],
      [px(R.width), COLORS.road],
    ] as const) {
      g.lineStyle(width, color, 1).lineBetween(a.x, a.y, x, y);
      g.fillStyle(color, 1).fillCircle(a.x, a.y, width / 2).fillCircle(x, y, width / 2);
    }
  }

  /** The token on its way from level `from` to `to`: share `k` of the way, `hops` hops of `height` CSS px. */
  moveToken(from: number, to: number, k: number, hops: number, height: number): void {
    const a = this.o.points[from];
    const b = this.o.points[to];
    if (!a || !b) return;
    this.tokenOverride = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, hop: Math.abs(Math.sin(k * Math.PI * hops)) * height };
  }

  /** Hides the dashes and the walker while the level-open animation plays. */
  setQuiet(quiet: boolean): void {
    this.quiet = quiet;
    this.dashes?.setVisible(!quiet);
    this.walker?.setVisible(!quiet);
  }

  update(time: number, delta: number): void {
    const sec = time / 1000;
    if (MAP_FX.showSway) {
      const amp = (MAP_FX.decor.swayDeg * Math.PI) / 180;
      for (const s of this.swaying) s.sprite.rotation = amp * Math.sin(sec * MAP_FX.decor.swaySpeed + s.phase * Math.PI * 2);
      for (const s of this.sails) s.sprite.rotation = sec * MAP_FX.decor.sailSpeed + s.phase * Math.PI * 2;
      const S = MAP_FX.decor.smoke;
      for (const s of this.smoke) {
        const k = (time / S.ms + s.phase) % 1;
        s.sprite.setPosition(s.x + px(S.x + S.dx * k), s.y + px(S.y + S.dy * k));
        s.sprite.setScale((S.r0 + (S.r1 - S.r0) * k) / 8).setAlpha(S.alpha * (1 - k));
      }
    }
    this.updateDashes(sec);
    this.updateToken(sec);
    this.updateWalker(time, sec);
    this.updateClouds(delta);
  }

  private image(b: Baked, x: number, y: number): Phaser.GameObjects.Image {
    return this.scene.add.image(x, y, b.key).setOrigin(b.originX, b.originY);
  }

  // ---- Road ---------------------------------------------------------------------------------------

  /** Walked segments solid, the rest dimmed (V-2.2). Round joints are discs at the level points. */
  private drawRoad(): void {
    const { points } = this.o;
    const R = MAP_FX.road;
    this.walked.clear();
    this.ahead.clear();
    for (const [width, color] of [
      [px(R.edgeWidth), COLORS.roadEdge],
      [px(R.width), COLORS.road],
    ] as const) {
      for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        // Segment i leads to level i + 1: walked once that level is completed.
        const g = !MAP_FX.showRoadProgress || i + 1 < this.done ? this.walked : this.ahead;
        g.lineStyle(width, color, 1).lineBetween(a.x, a.y, b.x, b.y);
        g.fillStyle(color, 1).fillCircle(a.x, a.y, width / 2).fillCircle(b.x, b.y, width / 2);
      }
    }
  }

  /** White dashes running from the last completed level toward the current one. */
  private updateDashes(sec: number): void {
    const g = this.dashes;
    if (!g || !g.visible) return;
    const R = MAP_FX.road;
    const a = this.o.points[this.done - 1]!;
    const b = this.o.points[this.done]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const dash = px(R.dash);
    const period = dash + px(R.gap);
    const offset = (sec * px(R.dashSpeed)) % period;
    const w = px(R.dashWidth);
    g.clear();
    g.lineStyle(w, 0xffffff, 1);
    g.fillStyle(0xffffff, 1);
    for (let s = offset - period; s < len; s += period) {
      const from = Math.max(0, s);
      const to = Math.min(len, s + dash);
      if (to <= from) continue;
      const x0 = a.x + ux * from;
      const y0 = a.y + uy * from;
      const x1 = a.x + ux * to;
      const y1 = a.y + uy * to;
      g.lineBetween(x0, y0, x1, y1);
      g.fillCircle(x0, y0, w / 2).fillCircle(x1, y1, w / 2);
    }
  }

  // ---- Token and walker ---------------------------------------------------------------------------

  private updateToken(sec: number): void {
    const t = this.token;
    if (!t) return;
    const T = MAP_FX.token;
    const o = this.tokenOverride;
    const x = o ? o.x : t.at.x;
    const y = o ? o.y : t.at.y;
    const hop = o ? o.hop : Math.abs(Math.sin(sec * T.hopSpeed)) * T.hop;
    const r = this.o.nodeRadius;
    t.sprite.setPosition(x, y - r - px(T.lift + hop));
    // The shadow shrinks while the token is in the air.
    const squash = Math.max(0.3, 1 - hop / 60);
    t.shadow.setPosition(x, y - r - px(T.shadowLift));
    t.shadow.setScale((T.shadowW * squash) / 16, (T.shadowH * squash) / 16);
  }

  /** Back and forth between the first and the last completed level, one segment per segmentMs. */
  private updateWalker(time: number, sec: number): void {
    const w = this.walker;
    if (!w || !w.visible) return;
    const W = MAP_FX.walker;
    const span = this.done - 1;
    const period = span * W.segmentMs;
    const u = (time % (period * 2)) / period;
    const pos = u <= 1 ? u * span : (2 - u) * span;
    const i = Math.min(Math.floor(pos), span - 1);
    const f = pos - i;
    const a = this.o.points[i]!;
    const b = this.o.points[i + 1]!;
    w.setPosition(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f - px(Math.abs(Math.sin(sec * W.bobSpeed)) * W.bob));
  }

  // ---- Decor --------------------------------------------------------------------------------------

  private placeDecor(): void {
    const { scene, o } = this;
    const D = MAP_FX.decor;
    const edge = px(D.edge);
    const scale = px(1);
    const items = placeDecor<DecorKind>({
      seed: o.chapter,
      path: o.points,
      nodeRadius: o.nodeRadius,
      nodeClearance: px(D.nodeClearance),
      roadClearance: px(D.roadClearance),
      itemGap: px(D.itemGap),
      area: { x: edge, y: edge, width: o.world.width - edge * 2, height: o.world.height - edge * 2 },
      kinds: D.kinds.map((k) => ({ ...k, radius: k.radius * scale })),
      count: D.count,
      maxTries: D.maxTries,
    });
    const shadow = shadowTexture(scene);
    const extent = Math.max(1, o.world.height);
    for (const d of items) {
      const variant = d.tint > 0.5 ? 0 : 1;
      if (d.kind === 'pond') {
        this.image(decorTexture(scene, 'pond', 0), d.x, d.y).setDepth(MAP_DEPTH.ponds);
        continue;
      }
      const [dy, rx, ry] = D.shadows[d.kind];
      this.image(shadow, d.x, d.y + px(dy))
        .setTint(0x000000)
        .setAlpha(D.shadowAlpha)
        .setScale(rx / 16, ry / 16)
        .setDepth(MAP_DEPTH.shadows);
      // Lower items are drawn over upper ones.
      const depth = MAP_DEPTH.decor + (d.y / extent) * 0.9;
      const foot = d.kind === 'tree' || d.kind === 'pine' ? px(D.footY[d.kind]) : 0;
      const body = this.image(decorTexture(scene, d.kind, variant), d.x, d.y + foot).setDepth(depth);
      if (d.kind === 'tree' || d.kind === 'pine') this.swaying.push({ sprite: body, phase: d.phase });
      if (d.kind === 'mill') {
        const sails = this.image(sailsTexture(scene), d.x, d.y - px(D.sailHub)).setDepth(depth + 0.001);
        sails.rotation = d.phase * Math.PI * 2;
        this.sails.push({ sprite: sails, phase: d.phase });
      }
      if (d.kind === 'house' && MAP_FX.showSway) {
        const puff = this.image(puffTexture(scene), d.x, d.y).setDepth(depth + 0.001);
        this.smoke.push({ sprite: puff, x: d.x, y: d.y, phase: d.phase });
      }
    }
  }

  // ---- Clouds -------------------------------------------------------------------------------------

  private placeClouds(): void {
    const C = MAP_FX.clouds;
    const body = cloudTexture(this.scene);
    const shade = cloudShadowTexture(this.scene);
    const { world, portrait, band } = this.o;
    for (let i = 0; i < C.count; i++) {
      const scale = 0.8 + (i % 3) * 0.3;
      const make = (b: Baked, alpha: number, depth: number): Phaser.GameObjects.Image =>
        this.scene.add.image(0, 0, b.key).setOrigin(b.originX, b.originY).setScrollFactor(0).setAlpha(alpha).setScale(scale).setDepth(depth);
      // The shadow lies under every cloud, so one cloud never darkens another.
      const shadow = make(shade, C.shadowAlpha, MAP_DEPTH.cloudShadows);
      const sprite = make(body, C.alpha, MAP_DEPTH.clouds);
      // Portrait: spread along the world height (the scroll axis), drift across. Landscape: rows in the band.
      const x = portrait ? px((i * 137) % 360) : (i / C.count) * world.width * C.parallax;
      const y = portrait ? (i * world.height) / C.count + px(40) : band.top + ((i % 3) + 0.5) * ((band.bottom - band.top) / 3);
      this.clouds.push({ sprite, shadow, x, y, speed: C.speedMin + (i % 4) * C.speedStep });
    }
  }

  private updateClouds(delta: number): void {
    if (this.clouds.length === 0) return;
    const C = MAP_FX.clouds;
    const cam = this.scene.cameras.main;
    const { world, portrait } = this.o;
    const pad = px(110);
    for (const c of this.clouds) {
      c.x += (px(c.speed) * delta) / 1000;
      if (portrait) {
        if (c.x > cam.width + pad) c.x = -pad;
        // Clouds are closer to the camera than the ground: they scroll parallax times faster.
        const span = world.height * C.parallax;
        c.sprite.setPosition(c.x, wrap(c.y - cam.scrollY * C.parallax, span) - px(60));
      } else {
        const span = world.width * C.parallax + pad * 2;
        c.sprite.setPosition(wrap(c.x - cam.scrollX * C.parallax, span) - pad, c.y);
      }
      c.shadow.setPosition(c.sprite.x, c.sprite.y);
    }
  }
}

function wrap(v: number, span: number): number {
  return ((v % span) + span) % span;
}
