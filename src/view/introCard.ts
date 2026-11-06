import * as Phaser from 'phaser';
import { COLORS, INTRO_CARD } from '../config/game';
import { textButton } from './ui';
import { px, textStyle } from './layout';

export interface IntroCardOptions {
  /** Frame and title color. */
  accent: number;
  /** Draws the picture centered at (0, 0) of `g` in a box of `size` game px. */
  picture: (g: Phaser.GameObjects.Graphics, size: number) => void;
  /** Picture box, CSS px. */
  pictureSize: number;
  title: string;
  body: string;
  /** A button closes the card (≥ 48 px); without one a tap anywhere does, or the timer. */
  button?: string;
  autoCloseMs?: number;
  onClose: () => void;
}

/**
 * A card before the battle (the enemy leader, the evil mage — PLAYTEST-1 F-8): dimmed screen, a framed panel with a
 * picture, a title and a few lines. The battle waits for it; the caller pauses it and resumes in `onClose`.
 */
export function showIntroCard(scene: Phaser.Scene, o: IntroCardOptions): void {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const C = INTRO_CARD;
  const card = scene.add.container(0, 0).setDepth(210);
  const dim = scene.add.rectangle(w / 2, h / 2, w, h, COLORS.dim, 0.55).setInteractive();
  const panelW = Math.min(w - px(32), px(C.width));
  const textW = panelW - px(32);

  // Texts first: the panel grows to fit the body.
  const title = scene.add.text(w / 2, 0, o.title, textStyle(24, o.accent)).setOrigin(0.5).setStroke('#1f2937', px(4));
  const body = scene.add
    .text(w / 2, 0, o.body, textStyle(16, COLORS.textDark))
    .setOrigin(0.5, 0)
    .setAlign('center')
    .setWordWrapWidth(textW, true);
  const pic = px(o.pictureSize);
  const buttonH = o.button ? px(C.buttonHeight) + px(C.gap) : 0;
  const panelH = px(C.pad) + pic + px(C.gap) + title.height + px(C.gap) / 2 + body.height + px(C.gap) + buttonH + px(C.pad) / 2;
  const x0 = w / 2 - panelW / 2;
  const y0 = h / 2 - panelH / 2;

  const panel = scene.add.graphics();
  panel.fillStyle(COLORS.outline, 0.4).fillRoundedRect(x0 + px(4), y0 + px(6), panelW, panelH, px(22));
  panel.fillStyle(COLORS.panel, 1).fillRoundedRect(x0, y0, panelW, panelH, px(22));
  panel.lineStyle(px(4), o.accent, 1).strokeRoundedRect(x0, y0, panelW, panelH, px(22));
  const picture = scene.add.graphics({ x: w / 2, y: y0 + px(C.pad) + pic / 2 });
  o.picture(picture, pic);
  let y = y0 + px(C.pad) + pic + px(C.gap);
  title.setY(y + title.height / 2);
  y += title.height + px(C.gap) / 2;
  body.setY(y);
  y += body.height + px(C.gap);
  card.add([dim, panel, picture, title, body]);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    scene.tweens.add({ targets: card, alpha: 0, duration: 160, onComplete: () => card.destroy() });
    o.onClose();
  };
  if (o.button) {
    card.add(textButton(scene, w / 2, y + px(C.buttonHeight) / 2, px(C.buttonWidth), px(C.buttonHeight), o.button, close));
  } else {
    dim.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, close);
  }
  if (o.autoCloseMs !== undefined) scene.time.delayedCall(o.autoCloseMs, close);
  card.setAlpha(0);
  scene.tweens.add({ targets: card, alpha: 1, duration: 160 });
}
