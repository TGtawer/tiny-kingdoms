import type * as Phaser from 'phaser';
import { COLORS, HUD } from '../config/game';
import { SPECIAL_NODES, type BuildingType } from '../config/balance';
import { dragPath, type FingerHint, type TutorialStep, type UiAnchor } from '../core/tutorial/tutorial';
import { t } from '../i18n/i18n';
import { drawFinger } from './icons';
import { px, textStyle, type Point } from './layout';

export interface TutorialContext {
  /** Screen position of a node. */
  node(id: string): Point | null;
  /** Screen position of a HUD element (null while it is not shown). */
  ui(anchor: UiAnchor): Point | null;
  /** Screen position of a build menu button (null while the menu is closed). */
  build(type: BuildingType): Point | null;
}

/** Period of one finger gesture loop, ms. */
const FINGER_PERIOD_MS = 1800;

/**
 * Hint panel at the bottom, pulsing UI highlights and an animated finger showing the gesture.
 * A step without a hint shows nothing (it only waits for its condition).
 */
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
    // Above the HUD (depth 100) and the build menu, so rings around HUD buttons are visible.
    this.uiRing = scene.add.graphics().setDepth(105);
    this.finger = scene.add.graphics().setDepth(106);
    this.drawFinger();
    this.show(null);
  }

  /** Node ids the current step asks to highlight. */
  highlightedNodes(): string[] {
    return (this.step?.highlight ?? []).flatMap((h) => ('node' in h ? [h.node] : []));
  }

  /** `bottomOffsetCss`: HUD height below the panel (e.g. the spell bar). */
  show(step: TutorialStep | null, bottomOffsetCss = this.bottomOffsetCss): void {
    // A step without text is silent: no panel, no finger, no highlights.
    this.step = step?.hint !== undefined ? step : null;
    this.bottomOffsetCss = bottomOffsetCss;
    const shown = this.step;
    const visible = shown !== null;
    this.panel.setVisible(visible);
    this.text.setVisible(visible);
    this.finger.setVisible(Boolean(shown?.finger));
    this.uiRing.setVisible(visible);
    if (!shown) return;
    // Hints may show balance numbers (e.g. the chest gold).
    this.text.setText(t(shown.hint!, { gold: SPECIAL_NODES.chest.gold }));
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

  /** Per-frame animation of the finger and UI highlights. Animations run at normal speed during the slow-down. */
  update(time: number, ctx: TutorialContext): void {
    const step = this.step;
    if (!step) return;

    this.uiRing.clear();
    const pulse = 0.5 + 0.5 * Math.sin(time / 180);
    for (const h of step.highlight ?? []) {
      const p = 'ui' in h ? ctx.ui(h.ui) : 'build' in h ? ctx.build(h.build) : null;
      if (!p) continue;
      const r = px('build' in h ? 44 : 26) + pulse * px(4);
      this.uiRing.lineStyle(px(4), COLORS.hint, 0.5 + 0.5 * pulse).strokeCircle(p.x, p.y, r);
    }

    if (step.finger) this.animateFinger(step.finger, time, ctx);
  }

  private animateFinger(finger: FingerHint, time: number, ctx: TutorialContext): void {
    const phase = (time % FINGER_PERIOD_MS) / FINGER_PERIOD_MS;
    const g = this.finger;

    if (finger.kind === 'tap' || finger.kind === 'tapUi') {
      const p = finger.kind === 'tap' ? ctx.node(finger.node) : ctx.ui(finger.ui);
      if (!p) {
        g.setVisible(false);
        return;
      }
      const press = phase < 0.5 ? Math.sin(phase * 2 * Math.PI) : 0;
      g.setVisible(true).setPosition(p.x, p.y + px(6) - press * px(6)).setScale(1 - press * 0.12);
      g.setAlpha(1);
      return;
    }

    const points = dragPath(finger).map((id) => ctx.node(id));
    if (points.some((p) => !p)) {
      g.setVisible(false);
      return;
    }
    g.setVisible(true).setScale(1);

    // Drag: press on the first node, slide through the others to the target, fade out.
    const move = Math.min(1, Math.max(0, (phase - 0.15) / 0.6));
    const eased = move * move * (3 - 2 * move);
    const at = alongPath(points as Point[], eased);
    g.setPosition(at.x, at.y + px(6));
    g.setAlpha(phase > 0.85 ? (1 - phase) / 0.15 : 1);
  }

  private drawFinger(): void {
    drawFinger(this.finger, px(1));
  }

  destroy(): void {
    this.panel.destroy();
    this.text.destroy();
    this.finger.destroy();
    this.uiRing.destroy();
  }
}

/** Point at share `k` (0..1) of the total length of a polyline. */
function alongPath(points: readonly Point[], k: number): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  let left = k * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i]!;
    if (left <= len || i === lengths.length - 1) {
      const f = len > 0 ? Math.min(1, left / len) : 1;
      const a = points[i]!;
      const b = points[i + 1]!;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    left -= len;
  }
  return points[points.length - 1]!;
}
