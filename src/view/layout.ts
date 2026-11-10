import {
  FONT_FAMILY,
  HUD,
  MIN_TOUCH_PX,
  NODE_HIT_SLOP_PX,
  NODE_RADIUS,
  NODE_RADIUS_MAX_PX,
  NODE_RADIUS_MIN_PX,
  cssColor,
  COLORS,
} from '../config/game';
import type { NodeSize } from '../config/balance';
import type * as Phaser from 'phaser';

/** Device pixel ratio the game renders at. Set once by main.ts and on resize. */
export const display = { dpr: 1 };

/** CSS px -> game px. */
export function px(css: number): number {
  return css * display.dpr;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Maps normalized level coordinates to screen. The bounding box of the nodes is fitted into the
 * available area with a uniform scale (so distances stay proportional to the simulation).
 * In portrait the field is rotated 90° when that makes it larger; the left side (player) goes down.
 * `orientArea` (default: `area`) is where that choice is made: the screen without per-level bars (tutorial hints,
 * goal plaque), so the same map on the same screen is never turned one way in a lesson and the other way outside it.
 */
/** Maps field units to screen px and sizes nodes; what node and road views need from a layout. */
export interface ScreenLayout {
  /** Screen px per field unit (road width follows it). */
  readonly scale: number;
  toScreen(x: number, y: number): Point;
  nodeRadius(size: NodeSize): number;
  hitRadius(size: NodeSize): number;
}

export class FieldLayout implements ScreenLayout {
  readonly rotated: boolean;
  /** Screen px per field unit. */
  readonly scale: number;
  private readonly minX: number;
  private readonly maxX: number;
  private readonly minY: number;
  private readonly originX: number;
  private readonly originY: number;
  private readonly pad: number;

  constructor(points: readonly Point[], area: Rect, orientArea: Rect = area) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    this.minX = Math.min(...xs);
    this.maxX = Math.max(...xs);
    this.minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    this.pad = NODE_RADIUS.large * 1.6;

    const bw = this.maxX - this.minX + 2 * this.pad;
    const bh = maxY - this.minY + 2 * this.pad;
    // Rotate only for a clear gain, so near-square screens don't flip back and forth.
    const gain = Math.min(orientArea.width / bh, orientArea.height / bw) / Math.min(orientArea.width / bw, orientArea.height / bh);
    this.rotated = gain > 1.08;
    this.scale = this.rotated ? Math.min(area.width / bh, area.height / bw) : Math.min(area.width / bw, area.height / bh);

    const screenW = (this.rotated ? bh : bw) * this.scale;
    const screenH = (this.rotated ? bw : bh) * this.scale;
    this.originX = area.x + (area.width - screenW) / 2;
    this.originY = area.y + (area.height - screenH) / 2;
  }

  toScreen(x: number, y: number): Point {
    return this.toScreenInto(x, y, { x: 0, y: 0 });
  }

  /** `toScreen` into an existing point (no allocation: units are placed every frame). */
  toScreenInto(x: number, y: number, out: Point): Point {
    if (this.rotated) {
      out.x = this.originX + (y - this.minY + this.pad) * this.scale;
      out.y = this.originY + (this.maxX + this.pad - x) * this.scale;
    } else {
      out.x = this.originX + (x - this.minX + this.pad) * this.scale;
      out.y = this.originY + (y - this.minY + this.pad) * this.scale;
    }
    return out;
  }

  nodeRadius(size: NodeSize): number {
    return clamp(NODE_RADIUS[size] * this.scale, px(NODE_RADIUS_MIN_PX), px(NODE_RADIUS_MAX_PX));
  }

  hitRadius(size: NodeSize): number {
    return Math.max(this.nodeRadius(size) + px(NODE_HIT_SLOP_PX), px(MIN_TOUCH_PX / 2));
  }
}

/** Screen area left for the field after HUD bars. `bottomReserveCss` is the bottom HUD height in CSS px. */
export function fieldArea(width: number, height: number, bottomReserveCss: number, topReserveCss = 0): Rect {
  const margin = px(HUD.fieldMargin);
  const top = px(HUD.topBar) + px(topReserveCss) + margin;
  const bottom = px(bottomReserveCss) + margin;
  return { x: margin, y: top, width: width - 2 * margin, height: Math.max(1, height - top - bottom) };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Common bold, outlined text style. `sizeCss` is in CSS px. */
export function textStyle(sizeCss: number, color: number = COLORS.text): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    fontSize: `${Math.round(px(sizeCss))}px`,
    color: cssColor(color),
  };
}
