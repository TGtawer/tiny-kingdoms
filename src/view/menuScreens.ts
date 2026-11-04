import * as Phaser from 'phaser';
import { COLORS, cssColor, MENU_FX, MENU_NIGHT, MENU_TOURNAMENT, type MenuBannerId } from '../config/game';
import type { MenuIcon } from './icons';
import { cubicOut, frameX, frameY, MenuBanner, seg, type MenuFrame } from './MenuBanner';

// The two main menu screens of docs/VISUALS.md V-4: «Tournament» (portrait) and «Night castle» (landscape).
// Static scenery is painted once into a screen-size canvas texture (gradients included, as in the prototypes);
// what moves every frame is the banners, the bunting, and small sprites that only change position or alpha.

/** Draw order of the menu layers; the title and the corner UI are placed by MenuScene. */
export const MENU_DEPTH = {
  bg: 0,
  ambient: 1,
  garland: 2,
  title: 3,
  poles: 4,
  /** Banners: map, upgrades, play (the main one on top); labels at +0.2, touch zones at +0.7. */
  banner: 5,
  framing: 9,
  lanterns: 10,
  fireflies: 11,
  ui: 20,
} as const;

export interface MenuScreenOptions {
  /** Labels per banner (the Play banner has two lines). */
  labels: Record<MenuBannerId, readonly string[]>;
  onPress: (id: MenuBannerId) => void;
}

export interface MenuScreen {
  readonly frame: MenuFrame;
  /** Title center and font size, reference px. */
  readonly title: { x: number; y: number; size: number };
  update(t: number, dt: number, e: number): void;
  destroy(): void;
}

const ICONS: Record<MenuBannerId, MenuIcon> = { map: 'map', play: 'play', up: 'hammer' };
const ORDER: readonly MenuBannerId[] = ['map', 'up', 'play'];

let nextKey = 0;

/** Fits the reference screen into w x h, centered. */
export function fitFrame(w: number, h: number, ref: { w: number; h: number }): MenuFrame {
  const s = Math.min(w / ref.w, h / ref.h);
  return { s, ox: (w - ref.w * s) / 2, oy: (h - ref.h * s) / 2 };
}

/** Base: the scene, its frame, the canvas background and the scaled layers. */
abstract class Screen implements MenuScreen {
  protected readonly objects: Phaser.GameObjects.GameObject[] = [];
  protected readonly banners: MenuBanner[] = [];
  private readonly textures: string[] = [];

  constructor(
    protected readonly scene: Phaser.Scene,
    readonly frame: MenuFrame,
    readonly title: { x: number; y: number; size: number },
  ) {}

  abstract update(t: number, dt: number, e: number): void;

  destroy(): void {
    for (const b of this.banners) b.destroy();
    for (const o of this.objects) o.destroy();
    for (const key of this.textures) this.scene.textures.remove(key);
  }

  /** A container in reference px (moved and scaled onto the screen). */
  protected layer(depth: number): Phaser.GameObjects.Container {
    const c = this.scene.add.container(this.frame.ox, this.frame.oy).setScale(this.frame.s).setDepth(depth);
    this.objects.push(c);
    return c;
  }

  /** A canvas texture of w x h game px, painted once; returns its key. */
  protected canvas(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): string {
    const key = `menu-canvas-${nextKey++}`;
    const tex = this.scene.textures.createCanvas(key, Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)))!;
    paint(tex.getContext());
    tex.refresh();
    this.textures.push(key);
    return key;
  }

  protected image(key: string, x: number, y: number, depth: number): Phaser.GameObjects.Image {
    const img = this.scene.add.image(x, y, key).setDepth(depth);
    this.objects.push(img);
    return img;
  }

  /** Puts the canvas transform into reference px. */
  protected toRef(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(this.frame.s, 0, 0, this.frame.s, this.frame.ox, this.frame.oy);
  }

  protected addBanners(
    specs: ReadonlyArray<{ id: MenuBannerId; x: number; y: number; w: number; len: number }>,
    style: (id: MenuBannerId) => { color: number; trim: number },
    tip: 'swallow' | 'point',
    flat: boolean,
    o: MenuScreenOptions,
  ): void {
    const E = MENU_FX.entrance;
    ORDER.forEach((id, i) => {
      const b = specs.find((s) => s.id === id)!;
      const depth = MENU_DEPTH.banner + i;
      const layer = this.layer(depth);
      const { color, trim } = style(id);
      this.banners.push(
        new MenuBanner(
          this.scene,
          layer,
          this.frame,
          { ...b, color, trim, tip, icon: ICONS[id], labels: o.labels[id], dropDelayMs: E.bannerDelaysMs[i] ?? 0 },
          flat,
          depth + 0.2,
          () => o.onPress(id),
        ),
      );
    });
  }
}

// ---- «Tournament» (portrait) ---------------------------------------------------------------------------

export class TournamentScreen extends Screen {
  private readonly garland: Phaser.GameObjects.Graphics;
  private readonly poles: Phaser.GameObjects.Graphics;
  private readonly crossbars: Phaser.GameObjects.Graphics;
  private polesDone = -1;

  constructor(scene: Phaser.Scene, w: number, h: number, o: MenuScreenOptions) {
    const T = MENU_TOURNAMENT;
    super(scene, fitFrame(w, h, T.ref), T.title);
    const bg = this.canvas(w, h, (ctx) => this.paintBackground(ctx, w, h));
    this.image(bg, w / 2, h / 2, MENU_DEPTH.bg);

    this.garland = scene.add.graphics();
    this.layer(MENU_DEPTH.garland).add(this.garland);
    this.poles = scene.add.graphics();
    this.layer(MENU_DEPTH.poles).add(this.poles);
    this.addBanners(T.banners, (id) => ({ color: id === 'play' ? T.colors.main : T.colors.side, trim: T.colors.trim }), 'swallow', true, o);
    this.crossbars = scene.add.graphics().setVisible(false);
    this.layer(MENU_DEPTH.framing).add(this.crossbars);
    this.drawCrossbars();
  }

  update(t: number, dt: number, e: number): void {
    this.drawGarland(t);
    const E = MENU_FX.entrance;
    const pk = cubicOut(seg(e * 1000, E.framingFromMs, E.framingFromMs + E.framingMs));
    if (pk !== this.polesDone) this.drawPoles(pk);
    this.crossbars.setVisible(pk >= 1);
    for (const b of this.banners) b.update(t, dt, e);
  }

  private paintBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const T = MENU_TOURNAMENT;
    const f = this.frame;
    // Sky and grass reach the screen edges; the rest is drawn in reference px.
    const sky = ctx.createLinearGradient(0, frameY(f, 0), 0, frameY(f, T.sky.to));
    sky.addColorStop(0, T.sky.top);
    sky.addColorStop(1, T.sky.bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, frameY(f, T.sky.to));
    ctx.fillStyle = cssColor(COLORS.background);
    ctx.fillRect(0, frameY(f, T.grassFrom), w, h);

    // Grass tufts over the whole meadow, as dense as in the reference.
    const r = rng(T.tufts.seed);
    const top = frameY(f, T.tufts.from);
    const area = (w * (h - top)) / (f.s * f.s);
    const count = Math.round((T.tufts.count * area) / (T.ref.w * (T.ref.h - T.tufts.from)));
    ctx.strokeStyle = cssColor(COLORS.backgroundDark);
    ctx.lineWidth = 2 * f.s;
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const x = r() * w;
      const y = top + r() * (h - top);
      const s = (4 + r() * 3) * f.s;
      ctx.beginPath();
      ctx.moveTo(x - s, y);
      ctx.lineTo(x - s * 0.4, y - s * 1.2);
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - s * 1.5);
      ctx.moveTo(x + s, y);
      ctx.lineTo(x + s * 0.4, y - s * 1.2);
      ctx.stroke();
    }

    this.toRef(ctx);
    for (const tent of T.tents) paintTent(ctx, tent.x, tent.y, tent.w, tent.h, tent.color);

    // Tilt-yard fence across the whole width.
    const F = T.fence;
    const left = -f.ox / f.s;
    const right = (w - f.ox) / f.s;
    ctx.fillStyle = F.color;
    ctx.strokeStyle = cssColor(COLORS.outline);
    ctx.lineWidth = 2;
    ctx.fillRect(left, F.y, right - left, F.h);
    ctx.strokeRect(left - 2, F.y, right - left + 4, F.h);
    // Symmetric: post centers at center ± (k + 0.5) * postEvery, so both screen edges get the same gap.
    const center = (left + right) / 2;
    const half = Math.ceil((right - left) / 2 / F.postEvery);
    for (let k = -half; k < half; k++) {
      const x = center + (k + 0.5) * F.postEvery - F.postW / 2;
      if (x + F.postW < left || x > right) continue;
      ctx.fillRect(x, F.postTop, F.postW, F.postH);
      ctx.strokeRect(x, F.postTop, F.postW, F.postH);
    }
  }

  /** Bunting tied to the poles on top of the two big tents: the ends stay put, the rope sags and swings. */
  private drawGarland(t: number): void {
    const G = MENU_TOURNAMENT.garland;
    const g = this.garland;
    const at = (k: number): [number, number] => {
      const bell = Math.sin(k * Math.PI);
      return [
        G.ax + (G.bx - G.ax) * k + bell * Math.sin(t * 1.3) * 3,
        G.ay + (G.by - G.ay) * k + bell * (G.sag + Math.sin(t * 1.8) * 4 + Math.sin(t * 3.1 + k * 4) * 1.2),
      ];
    };
    g.clear();
    g.lineStyle(1.5, COLORS.outline, 1);
    g.beginPath();
    for (let i = 0; i <= G.points; i++) {
      const [x, y] = at(i / G.points);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();
    for (let i = 1; i <= G.flags; i++) {
      const k = i / (G.flags + 1);
      const [px, py] = at(k);
      const [qx, qy] = at(k + 0.02);
      const a = Math.atan2(qy - py, qx - px) + Math.sin(t * 2.6 + i) * 0.08;
      const rot = (x: number, y: number): [number, number] => [px + x * Math.cos(a) - y * Math.sin(a), py + x * Math.sin(a) + y * Math.cos(a)];
      const [x1, y1] = rot(-G.flagW / 2, 0);
      const [x2, y2] = rot(G.flagW / 2, 0);
      const [x3, y3] = rot(0, G.flagH);
      g.fillStyle(G.colors[i % G.colors.length]!, 1).fillTriangle(x1, y1, x2, y2, x3, y3);
      g.lineStyle(1, COLORS.outline, 1).strokeTriangle(x1, y1, x2, y2, x3, y3);
    }
  }

  /** Poles grow up from the bottom during the entrance (`pk` 0..1), then stay. */
  private drawPoles(pk: number): void {
    this.polesDone = pk;
    const T = MENU_TOURNAMENT;
    const P = T.pole;
    const g = this.poles;
    g.clear();
    for (const b of T.banners) {
      const top = b.y - P.above - (b.id === 'play' ? P.playAbove : 0);
      const bottom = Math.max(P.bottom, b.y + b.len + P.below);
      const tp = T.ref.h + (top - T.ref.h) * pk;
      g.fillStyle(0x000000, 0.18).fillEllipse(b.x + 10, bottom, 32, 8);
      g.fillStyle(P.color, 1).fillRect(b.x - P.width / 2, tp, P.width, bottom - tp);
      g.lineStyle(P.outline, COLORS.outline, 1).strokeRect(b.x - P.width / 2, tp, P.width, bottom - tp);
      // Gold finial: a diamond and a ball under it.
      g.fillStyle(COLORS.gold, 1);
      g.beginPath().moveTo(b.x, tp - 22).lineTo(b.x + 7, tp - 6).lineTo(b.x, tp).lineTo(b.x - 7, tp - 6).closePath().fillPath();
      g.lineStyle(P.outline, COLORS.outline, 1);
      g.lineBetween(b.x, tp - 22, b.x + 7, tp - 6);
      g.lineBetween(b.x + 7, tp - 6, b.x, tp);
      g.lineBetween(b.x, tp, b.x - 7, tp - 6);
      g.lineBetween(b.x - 7, tp - 6, b.x, tp - 22);
      g.fillStyle(COLORS.gold, 1).fillCircle(b.x, tp + 2, 5);
      g.strokeCircle(b.x, tp + 2, 5);
    }
  }

  private drawCrossbars(): void {
    const T = MENU_TOURNAMENT;
    const C = T.crossbar;
    const g = this.crossbars;
    for (const b of T.banners) {
      const x = b.x - b.w / 2 - C.pad;
      g.fillStyle(T.pole.color, 1).fillRoundedRect(x, b.y + C.y, b.w + C.pad * 2, C.h, C.radius);
      g.lineStyle(T.pole.outline, COLORS.outline, 1).strokeRoundedRect(x, b.y + C.y, b.w + C.pad * 2, C.h, C.radius);
      for (const side of [-1, 1]) {
        g.fillStyle(COLORS.gold, 1).fillCircle(b.x + side * (b.w / 2 + C.pad), b.y - 1, C.ball);
        g.strokeCircle(b.x + side * (b.w / 2 + C.pad), b.y - 1, C.ball);
      }
    }
  }
}

function paintTent(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = cssColor(COLORS.outline);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w / 2, y - h * 0.45);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x + w / 2, y - h * 0.45);
  ctx.lineTo(x + w / 2, y);
  ctx.closePath();
  ctx.fillStyle = cssColor(COLORS.panel);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = color;
  for (let i = -3; i < 4; i += 2) {
    ctx.beginPath();
    ctx.moveTo(x + (i * w) / 8, y);
    ctx.lineTo(x, y - h);
    ctx.lineTo(x + ((i + 1) * w) / 8, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.stroke();
  ctx.fillStyle = '#5b3a1f';
  ctx.beginPath();
  ctx.moveTo(x - 6, y);
  ctx.lineTo(x, y - h * 0.35);
  ctx.lineTo(x + 6, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Flagpole and pennant on top.
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x, y - h - 12);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - h - 12);
  ctx.lineTo(x + 12, y - h - 8);
  ctx.lineTo(x, y - h - 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ---- «Night castle» (landscape) ------------------------------------------------------------------------

interface Twinkle {
  img: Phaser.GameObjects.Image;
  phase: number;
  /** Window: its x (flicker phase); star: unused. */
  x: number;
}

interface Firefly {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  phase: number;
  speed: number;
}

export class NightScreen extends Screen {
  private readonly stars: Twinkle[] = [];
  private readonly windows: Twinkle[] = [];
  private readonly flies: Firefly[] = [];
  private readonly beam: Phaser.GameObjects.Container;
  private readonly lanternBodies: Phaser.GameObjects.Graphics;
  private readonly glows: Array<{ img: Phaser.GameObjects.Image; x: number }> = [];

  constructor(scene: Phaser.Scene, w: number, h: number, o: MenuScreenOptions) {
    const N = MENU_NIGHT;
    super(scene, fitFrame(w, h, N.ref), N.title);
    const f = this.frame;
    const bg = this.canvas(w, h, (ctx) => this.paintBackground(ctx, w, h));
    this.image(bg, w / 2, h / 2, MENU_DEPTH.bg);

    // Stars twinkle all over the sky, as dense as in the reference.
    const dot = this.canvas(16, 16, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(8, 8, 8, 0, Math.PI * 2);
      ctx.fill();
    });
    const r0 = rng(N.stars.seed);
    const skyH = frameY(f, N.stars.maxY);
    const count = Math.round((N.stars.count * w) / (N.ref.w * f.s));
    for (let i = 0; i < count; i++) {
      // Stars stay in the open sky: one that lands on a tower or a roof is moved to another spot.
      let x = r0() * w;
      let y = r0() * skyH;
      for (let tries = 0; tries < 20 && onCastle((x - f.ox) / f.s, (y - f.oy) / f.s); tries++) {
        x = r0() * w;
        y = r0() * skyH;
      }
      const size = (0.6 + r0() * 1.7) * f.s;
      const img = this.image(dot, x, y, MENU_DEPTH.ambient).setScale(size / 8).setTint(N.stars.color);
      this.stars.push({ img, phase: r0() * Math.PI * 2, x });
    }

    // Warm castle windows (positions as in the reference: random per tower).
    const win = this.canvas(8 * f.s, 13 * f.s, (ctx) => {
      ctx.fillStyle = cssColor(N.windows.color);
      roundRect(ctx, 0, 0, 8 * f.s, 13 * f.s, 4 * f.s);
      ctx.fill();
    });
    const r1 = rng(N.windows.seed);
    for (const [tx, tw, th] of N.towers) {
      for (let y = 570 - th + 24; y < 540; y += 34) {
        if (r1() >= 0.6) continue;
        const x = tx + (r1() - 0.5) * (tw - 16);
        const img = this.image(win, frameX(f, x), frameY(f, y + 6.5), MENU_DEPTH.ambient);
        this.windows.push({ img, phase: 0, x });
      }
    }

    this.addBanners(
      N.banners,
      (id) => (id === 'play' ? { color: N.colors.main, trim: N.colors.mainTrim } : { color: N.colors.side, trim: N.colors.sideTrim }),
      'point',
      false,
      o,
    );

    // The beam spans all banners and lanterns; it opens from the center during the entrance.
    const xs = [...N.banners.flatMap((b) => [b.x - b.w / 2, b.x + b.w / 2]), ...N.lanterns];
    const x0 = Math.min(...xs) - N.beam.pad;
    const x1 = Math.max(...xs) + N.beam.pad;
    const cx = (x0 + x1) / 2;
    const beamG = scene.add.graphics();
    beamG.fillStyle(N.beam.color, 1).fillRoundedRect(x0 - cx, -N.beam.h / 2, x1 - x0, N.beam.h, 10);
    beamG.lineStyle(3, COLORS.outline, 1).strokeRoundedRect(x0 - cx, -N.beam.h / 2, x1 - x0, N.beam.h, 10);
    beamG.fillStyle(0xffffff, 0.12).fillRoundedRect(x0 - cx + 6, -N.beam.h / 2 + 3, x1 - x0 - 12, 6, 3);
    this.beam = scene.add.container(cx, N.beamY, [beamG]);
    this.layer(MENU_DEPTH.framing).add(this.beam);

    // Lanterns hang under the beam: a warm glow over everything around, then the lamp.
    const L = N.lantern;
    const glowR = L.glow * f.s;
    const glow = this.canvas(glowR * 2, glowR * 2, (ctx) => {
      const gr = ctx.createRadialGradient(glowR, glowR, 3 * f.s, glowR, glowR, glowR);
      gr.addColorStop(0, 'rgba(255,200,110,.5)');
      gr.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, glowR * 2, glowR * 2);
    });
    const ly = N.beamY + 9;
    for (const lx of N.lanterns) this.glows.push({ img: this.image(glow, frameX(f, lx), frameY(f, ly + 18), MENU_DEPTH.lanterns).setAlpha(0), x: lx });
    this.lanternBodies = scene.add.graphics().setAlpha(0);
    const g = this.lanternBodies;
    for (const lx of N.lanterns) {
      g.lineStyle(2, COLORS.outline, 1).lineBetween(lx, ly, lx, ly + 8);
      g.fillStyle(L.body, 1).fillRoundedRect(lx - 8, ly + 8, 16, 20, 4);
      g.strokeRoundedRect(lx - 8, ly + 8, 16, 20, 4);
      for (const cy of [ly + 6, ly + 27]) {
        g.fillStyle(L.cap, 1).fillRect(lx - 10, cy, 20, 4);
        g.strokeRect(lx - 10, cy, 20, 4);
      }
    }
    this.layer(MENU_DEPTH.lanterns + 0.1).add(g);

    // Fireflies drift on small ellipses and blink.
    const FF = N.fireflies;
    const fr = FF.glow * f.s;
    const fly = this.canvas(fr * 2, fr * 2, (ctx) => {
      const gr = ctx.createRadialGradient(fr, fr, 0, fr, fr, fr);
      gr.addColorStop(0, `rgba(${FF.color.join(',')},1)`);
      gr.addColorStop(1, `rgba(${FF.color.join(',')},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, fr * 2, fr * 2);
    });
    const left = -f.ox / f.s;
    const span = w / f.s;
    for (let i = 0; i < FF.count; i++) {
      const x = left + r0() * span;
      const y = FF.fromY + r0() * FF.height;
      this.flies.push({ img: this.image(fly, 0, 0, MENU_DEPTH.fireflies), x, y, phase: r0() * Math.PI * 2, speed: 0.3 + r0() * 0.5 });
    }
  }

  update(t: number, dt: number, e: number): void {
    for (const s of this.stars) s.img.setAlpha(0.45 + (0.55 * (Math.sin(t * 1.7 + s.phase) + 1)) / 2);
    for (const wnd of this.windows) wnd.img.setAlpha(0.75 + 0.25 * Math.sin(t * 2 + wnd.x));
    for (const b of this.banners) b.update(t, dt, e);

    const E = MENU_FX.entrance;
    const bk = cubicOut(seg(e * 1000, E.framingFromMs, E.framingFromMs + E.nightBeamMs));
    this.beam.setScale(Math.max(0.001, bk), 1);
    const lit = bk >= 1 ? 1 : 0;
    this.lanternBodies.setAlpha(lit);
    for (const gl of this.glows) gl.img.setAlpha(lit).setScale(0.9 + 0.1 * Math.sin(t * 13 + gl.x));

    const f = this.frame;
    for (const fl of this.flies) {
      const x = fl.x + Math.sin(t * fl.speed + fl.phase) * 40;
      const y = fl.y + Math.cos(t * fl.speed * 1.3 + fl.phase) * 24;
      fl.img.setPosition(frameX(f, x), frameY(f, y)).setAlpha(0.4 + 0.6 * Math.max(0, Math.sin(t * 2 + fl.phase)));
    }
  }

  private paintBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const N = MENU_NIGHT;
    const f = this.frame;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, N.sky[0]);
    sky.addColorStop(0.6, N.sky[1]);
    sky.addColorStop(1, N.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // The hill continues past the reference edges at the height of its ends.
    ctx.fillStyle = N.castle;
    ctx.fillRect(0, frameY(f, 590), frameX(f, 0) + 1, h);
    ctx.fillRect(frameX(f, N.ref.w) - 1, frameY(f, 545), w, h);
    ctx.fillStyle = N.ground.color;
    ctx.fillRect(0, frameY(f, N.ground.y), w, h);

    this.toRef(ctx);
    // Moon with a soft halo and craters (it does not move: painted once).
    const M = N.moon;
    const halo = ctx.createRadialGradient(M.x, M.y, 10, M.x, M.y, M.halo);
    halo.addColorStop(0, 'rgba(255,248,214,.35)');
    halo.addColorStop(1, 'rgba(255,248,214,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(M.x, M.y, M.halo, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = M.color;
    ctx.beginPath();
    ctx.arc(M.x, M.y, M.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = cssColor(COLORS.outline);
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,190,150,.5)';
    for (const [x, y, r] of [
      [-10, -8, 7],
      [12, 10, 5],
      [6, -14, 4],
    ] as const) {
      ctx.beginPath();
      ctx.arc(M.x + x, M.y + y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Castle silhouette: the hill, towers with battlements, pointed roofs on the narrow towers, walls.
    ctx.fillStyle = N.castle;
    ctx.beginPath();
    ctx.moveTo(0, 590);
    ctx.quadraticCurveTo(320, 530, 640, 575);
    ctx.quadraticCurveTo(960, 610, 1280, 545);
    ctx.lineTo(1280, 720);
    ctx.lineTo(0, 720);
    ctx.fill();
    for (const [x, tw, th] of N.towers) {
      ctx.fillRect(x - tw / 2, 570 - th, tw, th + 60);
      // Battlements fit the tower edge to edge; towers with a pointed roof have none (they poked out under it).
      if (hasRoof(tw)) continue;
      for (const mx of merlons(tw)) ctx.fillRect(x - tw / 2 + mx, 570 - th - MERLON.h, MERLON.w, MERLON.h);
    }
    for (const [x, tw, th] of N.towers.filter(([, tw]) => hasRoof(tw))) {
      ctx.beginPath();
      ctx.moveTo(x - tw / 2 - 6, 570 - th);
      ctx.lineTo(x, 570 - th - N.roofH);
      ctx.lineTo(x + tw / 2 + 6, 570 - th);
      ctx.fill();
    }
    for (const [x, y, ww, hh] of N.walls) ctx.fillRect(x, y, ww, hh);
    ctx.fillStyle = N.ground.color;
    ctx.fillRect(0, N.ground.y, N.ref.w, 80);
  }
}

const MERLON = MENU_NIGHT.merlon;

function hasRoof(towerW: number): boolean {
  return towerW < MENU_NIGHT.roofMaxW;
}

/** Left edges of the battlements, spread evenly so the first and the last sit on the tower edges. */
function merlons(towerW: number): number[] {
  const n = Math.max(2, Math.round((towerW - MERLON.w) / MERLON.every) + 1);
  const step = (towerW - MERLON.w) / (n - 1);
  return Array.from({ length: n }, (_, i) => i * step);
}

/** Whether a reference-px point is on a tower, its battlements or its roof (with a small margin for the star size). */
function onCastle(x: number, y: number): boolean {
  const pad = 3;
  for (const [tx, tw, th] of MENU_NIGHT.towers) {
    const top = 570 - th - (hasRoof(tw) ? 0 : MERLON.h);
    if (Math.abs(x - tx) <= tw / 2 + pad && y >= top - pad) return true;
    if (!hasRoof(tw)) continue;
    const apex = 570 - th - MENU_NIGHT.roofH;
    const half = tw / 2 + 6;
    if (y >= apex - pad && y <= 570 - th && Math.abs(x - tx) <= (half * (y - apex)) / MENU_NIGHT.roofH + pad) return true;
  }
  return false;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The prototypes' LCG, so the scenery matches the reference. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

