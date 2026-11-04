import type * as Phaser from 'phaser';
import { COLORS, HUD } from '../config/game';
import type { FingerHint, TutorialStep } from '../core/tutorial/tutorial';
import { t } from '../i18n/i18n';
import { px, textStyle, type Point } from './layout';

export interface TutorialContext {
  /** Screen position of a node. */
  node(id: string): Point | null;
  /** Screen position of the gold counter. */
  gold(): Point;
}

/** Period of one finger gesture loop, ms. */
const FINGER_PERIOD_MS = 1800;

/** Hint panel at the bottom, pulsing UI highlights and an animated finger showing the gesture. */
export class TutorialView {
  private readonly scene: Phaser.Scene;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private readonly finger: Phaser.GameObjects.Graphics;
  private readonly uiRing: Phaser.GameObjects.Graphics;
  private step: TutorialStep | null = null;
  private bottomOffsetCss = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.panel = scene.add.graphics().setDepth(95);
    this.text = scene.add.text(0, 0, '', textStyle(17, COLORS.textDark)).setOrigin(0.5).setAlign('center').setDepth(96);
    this.uiRing = scene.add.graphics().setDepth(97);
    this.finger = scene.add.graphics().setDepth(98);
    this.drawFinger();
    this.show(null);
  }

  /** Node ids the current step asks to highlight. */
  highlightedNodes(): string[] {
    return (this.step?.highlight ?? []).flatMap((h) => ('node' in h ? [h.node] : []));
  }

  /** `bottomOffsetCss`: HUD height below the panel (e.g. the spell bar). */
  show(step: TutorialStep | null, bottomOffsetCss = this.bottomOffsetCss): void {
    this.step = step;
    this.bottomOffsetCss = bottomOffsetCss;
    const visible = step !== null;
    this.panel.setVisible(visible);
    this.text.setVisible(visible);
    this.finger.setVisible(Boolean(step?.finger));
    this.uiRing.setVisible(visible);
    if (!step) return;
    this.text.setText(t(step.hint));
    this.layout();
    this.panel.setAlpha(0);
    this.text.setAlpha(0);
    this.scene.tweens.add({ targets: [this.panel, this.text], alpha: 1, duration: 220 });
  }

  layout(): void {
    if (!this.step) return;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const panelW = Math.min(w - px(24), px(HUD.hintMaxWidth));
    const panelH = px(HUD.hintBar) - px(14);
    const cx = w / 2;
    const cy = h - px(this.bottomOffsetCss) - px(HUD.hintBar) / 2;

    this.text.setWordWrapWidth(panelW - px(28), true);
    this.text.setPosition(cx, cy);
    const g = this.panel;
    g.clear();
    g.fillStyle(COLORS.outline, 0.35).fillRoundedRect(cx - panelW / 2 + px(3), cy - panelH / 2 + px(4), panelW, panelH, px(18));
    g.fillStyle(COLORS.panel, 1).fillRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, px(18));
    g.lineStyle(px(3), COLORS.hint, 1).strokeRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, px(18));
  }

  /** Per-frame animation of the finger and UI highlights. */
  update(time: number, ctx: TutorialContext): void {
    const step = this.step;
    if (!step) return;

    this.uiRing.clear();
    if (step.highlight?.some((h) => 'ui' in h && h.ui === 'gold')) {
      const p = ctx.gold();
      const pulse = 0.5 + 0.5 * Math.sin(time / 180);
      this.uiRing.lineStyle(px(4), COLORS.hint, 0.5 + 0.5 * pulse).strokeCircle(p.x, p.y, px(22) + pulse * px(4));
    }

    if (step.finger) this.animateFinger(step.finger, time, ctx);
  }

  private animateFinger(finger: FingerHint, time: number, ctx: TutorialContext): void {
    const phase = (time % FINGER_PERIOD_MS) / FINGER_PERIOD_MS;
    const g = this.finger;

    if (finger.kind === 'tap') {
      const p = ctx.node(finger.node);
      if (!p) {
        g.setVisible(false);
        return;
      }
      const press = phase < 0.5 ? Math.sin(phase * 2 * Math.PI) : 0;
      g.setVisible(true).setPosition(p.x, p.y + px(6) - press * px(6)).setScale(1 - press * 0.12);
      g.setAlpha(1);
      return;
    }

    const from = ctx.node(finger.from);
    const to = ctx.node(finger.to);
    if (!from || !to) {
      g.setVisible(false);
      return;
    }
    g.setVisible(true).setScale(1);

    // Drag: press on the source, slide to the target, fade out.
    const move = Math.min(1, Math.max(0, (phase - 0.15) / 0.6));
    const eased = move * move * (3 - 2 * move);
    g.setPosition(from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased + px(6));
    g.setAlpha(phase > 0.85 ? (1 - phase) / 0.15 : 1);
  }

  /** Cartoon pointing hand; the fingertip is at (0, 0). */
  private drawFinger(): void {
    const g = this.finger;
    const s = px(1);
    const line = px(2.5);
    g.clear();
    // Finger.
    g.fillStyle(0xffffff, 1).fillRoundedRect(-7 * s, -2 * s, 14 * s, 30 * s, 7 * s);
    g.lineStyle(line, COLORS.outline, 1).strokeRoundedRect(-7 * s, -2 * s, 14 * s, 30 * s, 7 * s);
    // Palm with folded fingers.
    g.fillStyle(0xffffff, 1).fillRoundedRect(-9 * s, 18 * s, 30 * s, 26 * s, 10 * s);
    g.lineStyle(line, COLORS.outline, 1).strokeRoundedRect(-9 * s, 18 * s, 30 * s, 26 * s, 10 * s);
    g.lineStyle(px(1.5), COLORS.outline, 0.6);
    g.lineBetween(7 * s, 24 * s, 7 * s, 32 * s);
    g.lineBetween(14 * s, 24 * s, 14 * s, 32 * s);
    // Tap glow at the tip.
    g.fillStyle(COLORS.hint, 0.6).fillCircle(0, 0, 5 * s);
  }

  destroy(): void {
    this.panel.destroy();
    this.text.destroy();
    this.finger.destroy();
    this.uiRing.destroy();
  }
}
