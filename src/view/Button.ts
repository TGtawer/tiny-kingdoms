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

/**
 * Rounded button drawn with Graphics. Size is in game px but never below MIN_TOUCH_PX (CSS).
 * Fires on release over the button, so a press can be cancelled by sliding off.
 */
export class Button extends Phaser.GameObjects.Container {
  readonly bg: Phaser.GameObjects.Graphics;
  private readonly baseColor: number;
  private readonly radius: number;
  private enabled = true;
  private pressed = false;
  private btnW: number;
  private btnH: number;

  constructor(scene: Phaser.Scene, x: number, y: number, options: ButtonOptions) {
    super(scene, x, y);
    this.btnW = Math.max(options.width, px(MIN_TOUCH_PX));
    this.btnH = Math.max(options.height, px(MIN_TOUCH_PX));
    this.baseColor = options.color ?? COLORS.button;
    this.radius = options.radius ?? px(BUTTON_STYLE.radius);

    this.bg = scene.add.graphics();
    this.add(this.bg);
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

  /**
   * Glossy cartoon button (docs/prototypes/living-screens.html): soft shadow below, colored face,
   * a permanent highlight band on top, outline. Pressed: the face sinks toward the shadow.
   */
  private redraw(): void {
    const g = this.bg;
    const s = BUTTON_STYLE;
    const w = this.btnW;
    const h = this.btnH;
    const r = Math.min(this.radius, h / 2, w / 2);
    const color = !this.enabled ? COLORS.buttonDisabled : this.pressed ? COLORS.buttonPressed : this.baseColor;
    const top = -h / 2 + (this.pressed ? px(s.pressDrop) : 0);
    g.clear();
    g.fillStyle(COLORS.outline, s.shadowAlpha).fillRoundedRect(-w / 2, -h / 2 + px(s.shadowOffset), w, h, r);
    g.fillStyle(color, 1).fillRoundedRect(-w / 2, top, w, h, r);
    const inset = px(s.shineInset);
    const shineH = h * s.shineHeight;
    const shineR = Math.min(px(s.shineRadius), shineH / 2);
    g.fillStyle(0xffffff, s.shineAlpha).fillRoundedRect(-w / 2 + inset, top + px(s.shineTop), w - inset * 2, shineH, shineR);
    g.lineStyle(px(s.outline), COLORS.outline, 1).strokeRoundedRect(-w / 2, top, w, h, r);
  }
}
