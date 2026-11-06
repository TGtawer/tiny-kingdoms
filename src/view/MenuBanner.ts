import * as Phaser from 'phaser';
import { COLORS, cssColor, FONT_FAMILY, MENU_BANNER, MENU_FX, NODE_LIP, type MenuBannerId } from '../config/game';
import { drawLock, drawMenuIcon, shade, type MenuIcon } from './icons';

const B = MENU_BANNER;

/** Reference screen placed on the real one: reference px → game px. */
export interface MenuFrame {
  /** Game px per reference px. */
  s: number;
  ox: number;
  oy: number;
}

export function frameX(f: MenuFrame, x: number): number {
  return f.ox + x * f.s;
}

export function frameY(f: MenuFrame, y: number): number {
  return f.oy + y * f.s;
}

export interface BannerSpec {
  id: MenuBannerId;
  /** Top center of the cloth, width and length, reference px. */
  x: number;
  y: number;
  w: number;
  len: number;
  color: number;
  trim: number;
  tip: 'swallow' | 'point';
  icon: MenuIcon;
  /** One or two lines under the medallion. */
  labels: readonly string[];
  /** When the drop starts in the entrance, ms. */
  dropDelayMs: number;
  /** Not opened yet (TUTORIAL.md T-3): darkened cloth, lock on the medallion; still pressable. */
  locked?: boolean;
  /** Focus mode (PLAYTEST-1 F-1): darkened like a locked banner but without the lock, and not pressable. */
  dimmed?: boolean;
}

type Pt = readonly [number, number];

/**
 * A cloth banner that is a button (docs/VISUALS.md V-4.2). The cloth is redrawn every frame (three of them,
 * ~30 points each: cheap); the medallion is drawn once and moved with the cloth, labels are screen texts.
 * Flat style for the portrait «Tournament», rich (folds, stitched trim) for the landscape «Night castle».
 */
export class MenuBanner {
  private readonly cloth: Phaser.GameObjects.Graphics;
  private readonly medal: Phaser.GameObjects.Container;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[];
  private readonly zone: Phaser.GameObjects.Zone;
  private readonly main: boolean;
  private readonly phase: number;
  private readonly medalR: number;
  private readonly fontSize: number;
  private imp = 0;
  /**
   * Sway clock, radians: advanced by speed × dt every frame. The press speeds the swing up through this clock;
   * multiplying the scene time by a changing speed would jump the phase by tens of radians as the impulse decays.
   */
  private clock = 0;
  private flash = 0;
  private labelAlpha = 1;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    private readonly frame: MenuFrame,
    private readonly spec: BannerSpec,
    private readonly flat: boolean,
    labelDepth: number,
    onPress: () => void,
  ) {
    this.main = spec.id === 'play';
    this.phase = B.phase[spec.id];
    this.cloth = scene.add.graphics();
    this.medalR = spec.w * (this.main ? B.medalMain : B.medalSide);
    this.glow = scene.add.graphics().setAlpha(0);
    this.glow.fillStyle(B.pulse.color, 1).fillCircle(0, 0, this.medalR + B.pulse.pad);
    const medal = scene.add.graphics();
    this.drawMedal(medal);
    this.medal = scene.add.container(0, 0, [this.glow, medal]);
    layer.add([this.cloth, this.medal]);

    this.fontSize = this.main ? spec.w * B.labelMain : Math.min(spec.w * B.labelSide, B.labelSideMax);
    this.labels = spec.labels.map((text, j) => {
      const size = (j ? this.fontSize * B.labelSecond : this.fontSize) * frame.s;
      return scene.add
        .text(0, 0, text, {
          fontFamily: FONT_FAMILY,
          fontStyle: 'bold',
          fontSize: `${Math.round(size)}px`,
          color: cssColor(j ? B.labelSecondColor : COLORS.text),
        })
        .setOrigin(0.5)
        .setStroke(cssColor(COLORS.outline), (j ? B.labelSecondStroke : B.labelStroke) * frame.s)
        .setDepth(labelDepth);
    });
    this.labelAlpha = spec.locked || spec.dimmed ? B.locked.labelAlpha : 1;

    // The whole cloth with its tip is the touch area (always far above 48 px).
    const left = frameX(frame, spec.x - spec.w / 2);
    const top = frameY(frame, spec.y);
    this.zone = scene.add
      .zone(left, top, spec.w * frame.s, (spec.len + B.tipH) * frame.s)
      .setOrigin(0, 0)
      .setDepth(labelDepth + 0.5);
    if (!spec.dimmed) this.zone.setInteractive({ useHandCursor: true });
    this.zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.imp = 1;
      this.flash = 1;
      onPress();
    });
  }

  /** `t`: scene seconds, `dt`: frame seconds, `e`: seconds since the entrance started. */
  update(t: number, dt: number, e: number): void {
    const P = MENU_FX.press;
    this.imp = Math.max(0, this.imp - dt * P.impulseDecay);
    this.flash = Math.max(0, this.flash - dt * P.flashDecay);
    this.clock += dt * (B.sway.speed + B.sway.impSpeed * this.imp);
    const E = MENU_FX.entrance;
    const drop = backOut(seg(e * 1000, this.spec.dropDelayMs, this.spec.dropDelayMs + E.bannerMs));
    this.drawCloth(drop);

    const content = drop <= E.contentFrom ? 0 : seg(drop, E.contentFrom, 1);
    const { x, y } = this.spec;
    const len = this.spec.len * drop;
    const cy = y + len * B.medalAt;
    this.medal.setPosition(x + this.sway(B.medalSway), cy - this.medalR - B.medalGap).setAlpha(content);
    const pulseOn = this.main && e * 1000 >= E.pulseFromMs;
    this.glow.setAlpha(pulseOn ? B.pulse.alpha * ((Math.sin((t * 1000 * Math.PI * 2) / B.pulse.periodMs) + 1) / 2) : 0);
    const lx = frameX(this.frame, x + this.sway(B.labelAt));
    this.labels.forEach((label, j) => {
      const ly = cy + this.fontSize * 0.8 + j * this.fontSize * 1.05;
      label.setPosition(lx, frameY(this.frame, ly)).setAlpha(content * this.labelAlpha);
    });
  }

  get id(): MenuBannerId {
    return this.spec.id;
  }

  /** Medallion center and radius on screen, game px (follows the sway). */
  medalOnScreen(out: { x: number; y: number; r: number }): { x: number; y: number; r: number } {
    out.x = frameX(this.frame, this.medal.x);
    out.y = frameY(this.frame, this.medal.y);
    out.r = this.medalR * this.frame.s;
    return out;
  }

  destroy(): void {
    this.cloth.destroy();
    this.medal.destroy();
    for (const l of this.labels) l.destroy();
    this.zone.destroy();
  }

  private sway(k: number): number {
    const S = B.sway;
    return Math.sin(this.clock + this.phase - S.lag * k) * (S.amp + S.impAmp * this.imp) * k;
  }

  /** Cloth outline, `inset` px inside, moved by (dx, dy). */
  private path(len: number, tipH: number, inset = 0, dx = 0, dy = 0): Pt[] {
    const { x, y, w } = this.spec;
    const n = B.segments;
    const l = x - w / 2 + inset + dx;
    const r = x + w / 2 - inset + dx;
    const top = y + inset * 0.3 + dy;
    const bot = y + len - inset + dy;
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      pts.push([l + this.sway(k), top + (bot - top) * k]);
    }
    const sb = this.sway(1);
    if (this.spec.tip === 'point') pts.push([x + dx + sb, bot + tipH - inset * 0.6]);
    else pts.push([l + sb, bot + tipH * 0.9], [x + dx + sb, bot + inset * 0.2], [r + sb, bot + tipH * 0.9]);
    for (let i = n; i >= 0; i--) {
      const k = i / n;
      pts.push([r + this.sway(k), top + (bot - top) * k]);
    }
    return pts;
  }

  private drawCloth(drop: number): void {
    const g = this.cloth;
    g.clear();
    if (drop <= 0) return;
    const { x, y, w } = this.spec;
    const dark = this.spec.locked === true || this.spec.dimmed === true;
    const color = dark ? shade(this.spec.color, B.locked.shade) : this.spec.color;
    const trim = dark ? shade(this.spec.trim, B.locked.shade) : this.spec.trim;
    const len = this.spec.len * drop;
    const tipH = B.tipH * drop;
    const st = this.flat ? B.flat : B.rich;

    // Drop shadow on the background, then the cloth.
    g.fillStyle(COLORS.outline, st.shadowAlpha);
    fill(g, this.path(len, tipH, 0, st.shadowX, st.shadowY));
    const cloth = this.path(len, tipH);
    g.fillStyle(color, 1);
    fill(g, cloth);

    if (this.flat && B.clothShine) {
      // A thin rim of light along the left edge, following the cloth.
      const F = B.flat;
      const l = x - w / 2 + F.rimInset;
      const rim: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const k = F.rimFrom + ((F.rimTo - F.rimFrom) * i) / 10;
        rim.push([l + this.sway(k), y + len * k]);
      }
      g.lineStyle(F.rimWidth, 0xffffff, F.rimAlpha);
      polyline(g, rim);
    } else if (!this.flat) {
      this.drawFolds(g, len);
    }

    if (this.flash > 0) {
      g.fillStyle(0xffffff, MENU_FX.press.flashAlpha * this.flash);
      fill(g, cloth);
    }

    // Sleeve: a darker band across the top of the cloth.
    const sleeveH = Math.min(st.sleeve, len);
    const ks = sleeveH / Math.max(1, len);
    g.fillStyle(0x000000, st.sleeveAlpha);
    fill(g, [
      [x - w / 2 + this.sway(0), y],
      [x + w / 2 + this.sway(0), y],
      [x + w / 2 + this.sway(ks), y + sleeveH],
      [x - w / 2 + this.sway(ks), y + sleeveH],
    ]);

    // Embroidered trim inside the edge (and a stitch line on the rich style).
    const trimPath = this.path(len, tipH, B.trimInset);
    g.lineStyle(st.trim, trim, 1);
    stroke(g, trimPath);
    if (!this.flat) {
      const R = B.rich;
      g.lineStyle(R.stitch, shade(trim, R.stitchShade), 1);
      dashed(g, [...trimPath, trimPath[0]!], R.stitchDash, R.stitchGap);
    }

    g.lineStyle(B.outline, COLORS.outline, 1);
    stroke(g, cloth);
  }

  /** Rich style: soft vertical folds, light and dark in turn, kept inside the cloth edges. */
  private drawFolds(g: Phaser.GameObjects.Graphics, len: number): void {
    const R = B.rich;
    const { x, y, w } = this.spec;
    const n = B.segments;
    const shift = this.sway(0.6) * R.foldShift;
    for (let i = 0; i < R.folds; i++) {
      const fx = x - w / 2 + ((i + 0.5) * w) / R.folds + shift;
      const half = w / R.folds / 2;
      const light = i % 2 === 0;
      if (light && !B.clothShine) continue;
      const color = light ? 0xffffff : 0x000000;
      const peak = light ? R.foldLight : R.foldDark;
      for (let j = 0; j < n; j++) {
        const km = (j + 0.5) / n;
        const left = x - w / 2 + this.sway(km);
        const right = x + w / 2 + this.sway(km);
        const y0 = y + (len * j) / n;
        const y1 = y + (len * (j + 1)) / n;
        // Each fold: alpha 0 → peak → 0 across its width, clipped to the cloth of this slice.
        for (const [a, b, aa, ab] of [
          [fx - half, fx, 0, peak],
          [fx, fx + half, peak, 0],
        ] as const) {
          const xa = Math.max(a, left);
          const xb = Math.min(b, right);
          if (xb <= xa) continue;
          const at = (px: number): number => aa + ((ab - aa) * (px - a)) / (b - a);
          g.fillGradientStyle(color, color, color, color, at(xa), at(xb), at(xa), at(xb));
          g.fillRect(xa, y0, xb - xa, y1 - y0);
        }
      }
    }
  }

  private drawMedal(g: Phaser.GameObjects.Graphics): void {
    const r = this.medalR;
    const gold = COLORS.gold;
    if (this.flat) {
      g.fillStyle(gold, 1).fillCircle(0, 0, r);
    } else {
      // Darker rim exactly under the outline, the face a bit higher inside it (as on the level nodes).
      g.fillStyle(shade(gold, B.medalRing.rimShade), 1).fillCircle(0, 0, r);
      g.fillStyle(gold, 1).fillCircle(0, -r * NODE_LIP, r * (1 - NODE_LIP));
    }
    g.lineStyle(B.outline, COLORS.outline, 1).strokeCircle(0, 0, r);
    if (this.flat) {
      // Crescent highlight, as on the level nodes.
      const S = B.medalShine;
      const pts: Pt[] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const ex = Math.cos(a) * r * S.rx;
        const ey = Math.sin(a) * r * S.ry;
        pts.push([r * S.x + ex * Math.cos(S.angle) - ey * Math.sin(S.angle), r * S.y + ex * Math.sin(S.angle) + ey * Math.cos(S.angle)]);
      }
      g.fillStyle(0xffffff, S.alpha);
      fill(g, pts);
    } else {
      const M = B.medalRing;
      const ring: Pt[] = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        ring.push([Math.cos(a) * (r - M.inset), Math.sin(a) * (r - M.inset)]);
      }
      g.lineStyle(M.width, shade(gold, M.shade), 1);
      dashed(g, ring, M.dash, M.gap);
    }
    if (this.spec.locked) {
      // The lock takes the icon's place: dim the medallion (outline drawn again on top) and put a lock in the middle.
      g.fillStyle(COLORS.outline, B.locked.medalDim).fillCircle(0, 0, r);
      g.lineStyle(B.outline, COLORS.outline, 1).strokeCircle(0, 0, r);
      g.fillStyle(COLORS.panel, 1).fillCircle(0, 0, r * B.locked.lockDisc);
      g.lineStyle(B.outline, COLORS.outline, 1).strokeCircle(0, 0, r * B.locked.lockDisc);
      drawLock(g, 0, 0, r * B.locked.lockSize);
    } else {
      drawMenuIcon(g, this.spec.icon, 0, 0, r * B.iconScale);
      if (this.spec.dimmed) {
        g.fillStyle(COLORS.outline, B.locked.medalDim).fillCircle(0, 0, r);
        g.lineStyle(B.outline, COLORS.outline, 1).strokeCircle(0, 0, r);
      }
    }
  }
}

function fill(g: Phaser.GameObjects.Graphics, pts: readonly Pt[]): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath().fillPath();
}

function stroke(g: Phaser.GameObjects.Graphics, pts: readonly Pt[]): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath().strokePath();
}

function polyline(g: Phaser.GameObjects.Graphics, pts: readonly Pt[]): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.strokePath();
}

/** Dashed line along a polyline (dash, gap in the same units). */
function dashed(g: Phaser.GameObjects.Graphics, pts: readonly Pt[], dash: number, gap: number): void {
  let on = true;
  let left = dash;
  for (let i = 0; i + 1 < pts.length; i++) {
    let [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    let seglen = Math.hypot(bx - ax, by - ay);
    while (seglen > 0) {
      const step = Math.min(left, seglen);
      const k = step / seglen;
      const nx = ax + (bx - ax) * k;
      const ny = ay + (by - ay) * k;
      if (on) g.lineBetween(ax, ay, nx, ny);
      ax = nx;
      ay = ny;
      seglen -= step;
      left -= step;
      if (left <= 0) {
        on = !on;
        left = on ? dash : gap;
      }
    }
  }
}

export function seg(v: number, a: number, b: number): number {
  return Math.min(1, Math.max(0, (v - a) / (b - a)));
}

export function backOut(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return t <= 0 ? 0 : 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function cubicOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
