import * as Phaser from 'phaser';
import { COLORS, MIN_TOUCH_PX, SPOTLIGHT } from '../config/game';
import { hintLabel } from './hintPlaque';
import { drawFinger } from './icons';
import { px } from './layout';

export interface SpotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpotlightOptions {
  /** The only part of the screen left bright and pressable; screen coordinates. */
  hole: SpotRect;
  /** One short line of text, placed above or below the hole (where there is more room). */
  text: string;
  /** Finger tip position (taps there); none if omitted. */
  finger?: { x: number; y: number };
  /** "Tap anywhere to continue": the whole screen (hole included) calls this instead of passing the tap through. */
  onTapAnywhere?: () => void;
}

/**
 * Guided-tour overlay for scenes outside battle (TUTORIAL.md T-6): the screen is darkened except for a "hole"
 * around one element; taps outside the hole are swallowed, taps inside reach the element below.
 * Everything is in screen coordinates (no camera scroll). The hole is never smaller than a 48 px touch zone.
 */
export class Spotlight {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    options: SpotlightOptions,
  ) {
    const S = SPOTLIGHT;
    const w = scene.scale.width;
    const h = scene.scale.height;
    const hole = padHole(options.hole);
    const depth = S.depth;

    // Dim: four rects around the hole, plus a pulsing ring on its edge.
    const dim = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    dim.fillStyle(COLORS.dim, S.dimAlpha);
    dim.fillRect(0, 0, w, hole.y);
    dim.fillRect(0, hole.y + hole.h, w, h - hole.y - hole.h);
    dim.fillRect(0, hole.y, hole.x, hole.h);
    dim.fillRect(hole.x + hole.w, hole.y, w - hole.x - hole.w, hole.h);
    const ring = scene.add.graphics().setScrollFactor(0).setDepth(depth + 1);
    ring.lineStyle(px(4), COLORS.hint, 1).strokeRoundedRect(hole.x, hole.y, hole.w, hole.h, px(S.radius));
    scene.tweens.add({ targets: ring, alpha: 0.35, duration: S.pulseMs, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.objects.push(dim, ring);

    // Input: blockers around the hole swallow taps; "tap anywhere" covers the whole screen.
    const zone = (x: number, y: number, zw: number, zh: number): Phaser.GameObjects.Zone => {
      const z = scene.add.zone(x, y, Math.max(1, zw), Math.max(1, zh)).setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 2);
      z.setInteractive();
      this.objects.push(z);
      return z;
    };
    if (options.onTapAnywhere) {
      const onTap = options.onTapAnywhere;
      zone(0, 0, w, h).on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => onTap());
    } else {
      zone(0, 0, w, hole.y);
      zone(0, hole.y + hole.h, w, h - hole.y - hole.h);
      zone(0, hole.y, hole.x, hole.h);
      zone(hole.x + hole.w, hole.y, w - hole.x - hole.w, hole.h);
    }

    // One line of text on a panel, on the roomier side of the hole.
    const below = h - (hole.y + hole.h) > hole.y;
    const text = hintLabel(scene, options.text, 17, Math.min(w - px(40), px(S.textMaxWidth)))
      .setScrollFactor(0, 0, true)
      .setDepth(depth + 3);
    const gap = px(S.textGap) + (options.finger && below ? px(S.fingerRoom) : 0);
    text.setPosition(w / 2, below ? hole.y + hole.h + gap + text.height / 2 : hole.y - gap - text.height / 2);
    this.objects.push(text);

    if (options.finger) {
      const finger = scene.add.graphics().setScrollFactor(0).setDepth(depth + 4);
      drawFinger(finger, px(1));
      finger.setPosition(options.finger.x, options.finger.y + px(6));
      scene.tweens.add({ targets: finger, y: options.finger.y, scale: 0.9, duration: S.tapMs, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.objects.push(finger);
    }
  }

  destroy(): void {
    for (const o of this.objects) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.objects.length = 0;
  }
}

/** Adds the spotlight padding and grows the hole to at least a 48 px touch zone, keeping its center. */
function padHole(r: SpotRect): SpotRect {
  const pad = px(SPOTLIGHT.pad);
  const min = px(MIN_TOUCH_PX);
  const w = Math.max(min, r.w + pad * 2);
  const h = Math.max(min, r.h + pad * 2);
  return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
}
