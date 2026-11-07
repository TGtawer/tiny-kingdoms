import * as Phaser from 'phaser';
import { COLORS, BUTTON_STYLE, MIN_TOUCH_PX } from '../config/game';
import { px } from './layout';
import { playSfx } from './sound';

export interface ButtonOptions {
  width: number;
  height: number;
  color?: number;
  radius?: number;
  onClick: () => void;
}

/** Draws on the face between its color and the highlight (left/top edge, size and corner radius in game px). */
export type FaceDecor = (g: Phaser.GameObjects.Graphics, left: number, top: number, w: number, h: number, r: number) => void;

/** A face look that replaces the normal one (e.g. a build button the player can't afford yet). */
export interface ButtonFace {
  color: number;
  /** Draw the highlight band. */
  shine: boolean;
  decor?: FaceDecor;
}

/**
 * Rounded button drawn with Graphics. Size is in game px but never below MIN_TOUCH_PX (CSS).
 * Fires on release over the button, so a press can be cancelled by sliding off.
 * Everything added to the button (icons, labels) goes into `content`, which sinks with the face while pressed.
 */
export class Button extends Phaser.GameObjects.Container {
  readonly bg: Phaser.GameObjects.Graphics;
  /** Holds what was added to the button; moves down with the face on a press (docs/BUILD-BUTTON.md BB-1). */
  readonly content: Phaser.GameObjects.Container;
  private readonly baseColor: number;
  private readonly radius: number;
  private enabled = true;
  private pressed = false;
  private face: ButtonFace | null = null;
  private btnW: number;
  private btnH: number;

  constructor(scene: Phaser.Scene, x: number, y: number, options: ButtonOptions) {
    super(scene, x, y);
    this.btnW = Math.max(options.width, px(MIN_TOUCH_PX));
    this.btnH = Math.max(options.height, px(MIN_TOUCH_PX));
    this.baseColor = options.color ?? COLORS.button;
    this.radius = options.radius ?? px(BUTTON_STYLE.radius);

    this.bg = scene.add.graphics();
    this.content = new Phaser.GameObjects.Container(scene, 0, 0);
    super.add([this.bg, this.content]);
    this.setSize(this.btnW, this.btnH);
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.btnW, this.btnH), Phaser.Geom.Rectangle.Contains);
    this.redraw();

    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      if (!this.enabled) return;
      this.pressed = true;
      this.redraw();
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.redraw();
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.redraw();
      if (!this.enabled) return;
      playSfx('click');
      options.onClick();
    });

    scene.add.existing(this);
  }

  /** Children go into `content` so they sink with the face. */
  override add<T extends Phaser.GameObjects.GameObject>(child: T | T[]): this {
    this.content.add(child);
    return this;
  }

  override addAt<T extends Phaser.GameObjects.GameObject>(child: T | T[], index?: number): this {
    this.content.addAt(child, index);
    return this;
  }

  override remove<T extends Phaser.GameObjects.GameObject>(child: T | T[], destroyChild?: boolean): this {
    this.content.remove(child, destroyChild);
    return this;
  }

  override getByName<T extends Phaser.GameObjects.GameObject>(name: string): T {
    return this.content.getByName<T>(name);
  }

  get buttonWidth(): number {
    return this.btnW;
  }

  get buttonHeight(): number {
    return this.btnH;
  }

  setEnabled(enabled: boolean): this {
    if (this.enabled !== enabled) {
      this.enabled = enabled;
      this.pressed = false;
      this.redraw();
    }
    return this;
  }

  /** Replaces the face look (null: the normal one). Redraws at once; call it only when the look changes. */
  setFace(face: ButtonFace | null): this {
    this.face = face;
    this.redraw();
    return this;
  }

  /**
   * Glossy cartoon button (docs/prototypes/living-screens.html): soft shadow below, colored face,
   * a permanent highlight band on top, outline. Pressed: the face and the content sink toward the shadow.
   */
  private redraw(): void {
    const g = this.bg;
    const s = BUTTON_STYLE;
    const w = this.btnW;
    const h = this.btnH;
    const r = Math.min(this.radius, h / 2, w / 2);
    const face = this.face;
    const color = !this.enabled ? COLORS.buttonDisabled : face ? face.color : this.pressed ? COLORS.buttonPressed : this.baseColor;
    const drop = this.pressed ? px(s.pressDrop) : 0;
    const top = -h / 2 + drop;
    this.content.y = drop;
    g.clear();
    g.fillStyle(COLORS.outline, s.shadowAlpha).fillRoundedRect(-w / 2, -h / 2 + px(s.shadowOffset), w, h, r);
    g.fillStyle(color, 1).fillRoundedRect(-w / 2, top, w, h, r);
    if (this.enabled) face?.decor?.(g, -w / 2, top, w, h, r);
    if (face?.shine !== false) {
      const inset = px(s.shineInset);
      const shineH = h * s.shineHeight;
      const shineR = Math.min(px(s.shineRadius), shineH / 2);
      g.fillStyle(0xffffff, s.shineAlpha).fillRoundedRect(-w / 2 + inset, top + px(s.shineTop), w - inset * 2, shineH, shineR);
    }
    g.lineStyle(px(s.outline), COLORS.outline, 1).strokeRoundedRect(-w / 2, top, w, h, r);
  }
}
