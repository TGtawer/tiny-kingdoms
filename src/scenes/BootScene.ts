import * as Phaser from 'phaser';
import { BOOT, COLORS } from '../config/game';
import { parseMenuFocus } from '../core/meta/menuFocus';
import { tourScene, tourStep } from '../core/meta/onboarding';
import { t } from '../i18n/i18n';
import { px, textStyle } from '../view/layout';
import { ensureDotTexture } from '../view/ParticleBursts';
import type { BattleSceneData } from './BattleScene';
import { getStore, setMenuFocusOverride } from './registry';

/** Game event: the loading screen is done, the game is ready to play (main.ts signals the platform then). */
export const BOOT_READY = 'boot-ready';

/**
 * First scene: the loading screen (docs/PERF.md PF-6), then the main menu (PLAYTEST-1 F-1; on the first launch it is
 * in the focus mode), or back into an unfinished Upgrades tour.
 *
 * While it shows, the shaders are warmed up. On a computer Phaser draws up to `maxTextures` textures per batch and
 * compiles a shader variant the first time a batch uses a new number of them — a 50–150 ms frame each, which used to
 * fall on the first seconds of the first battle. Here frame k draws one batch of k tiny images with k different
 * textures (the color of the background, invisible), so every variant is compiled behind the loading screen. On a
 * phone a batch takes one texture (`autoMobileTextures`), there is a single variant and the screen passes at once.
 */
export class BootScene extends Phaser.Scene {
  /** Warm-up images, one texture each; image i is drawn while k > i. */
  private warmImages: Phaser.GameObjects.Image[] = [];
  /** Batch size drawn in the next frame (1…maxTextures), past the end when done. */
  private k = 1;
  private bar!: Phaser.GameObjects.Graphics;
  private done = false;

  constructor() {
    super('BootScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    // The battle effects' particle texture (docs/FX.md), ready before the first battle.
    ensureDotTexture(this);
    // ?menuFocus=on|off: compare the menu with and without the focus mode (production builds too).
    setMenuFocusOverride(this, parseMenuFocus(window.location.search));

    // The warm-up images first in the display list: the bar's Graphics after them ends their batch.
    const renderer = this.game.renderer as Partial<Phaser.Renderer.WebGL.WebGLRenderer>;
    const max = Math.max(1, renderer.maxTextures ?? 1);
    this.warmImages = [];
    for (let i = 0; i < max; i++) {
      const key = `boot-warm-${i}`;
      if (!this.textures.exists(key)) {
        const g = this.make.graphics({}, false);
        g.fillStyle(COLORS.background, 1).fillRect(0, 0, BOOT.warmTexturePx, BOOT.warmTexturePx);
        g.generateTexture(key, BOOT.warmTexturePx, BOOT.warmTexturePx);
        g.destroy();
      }
      this.warmImages.push(this.add.image(0, 0, key).setOrigin(0, 0).setVisible(false));
    }
    this.k = 1;
    this.done = false;

    const w = this.scale.width;
    const h = this.scale.height;
    this.bar = this.add.graphics();
    this.add
      .text(w / 2, h / 2 - px(BOOT.textGap), t('boot.loading'), textStyle(BOOT.textSize))
      .setOrigin(0.5)
      .setStroke('#1f2937', px(4));
    this.drawBar(0);
    this.showBatch();
  }

  override update(): void {
    if (this.done) return;
    // The frame before this one drew a batch of k textures: on to the next size, or done.
    this.k++;
    if (this.k <= this.warmImages.length) {
      this.drawBar((this.k - 1) / this.warmImages.length);
      this.showBatch();
      return;
    }
    this.done = true;
    this.game.events.emit(BOOT_READY);
    this.route();
  }

  /** Shows the first k warm-up images (one batch with k textures this frame). */
  private showBatch(): void {
    for (let i = 0; i < this.warmImages.length; i++) this.warmImages[i]!.setVisible(i < this.k);
  }

  /** The progress bar under the label, `share` 0..1 filled. */
  private drawBar(share: number): void {
    const width = Math.min(px(BOOT.barWidth), this.scale.width - px(BOOT.margin) * 2);
    const height = px(BOOT.barHeight);
    const x = (this.scale.width - width) / 2;
    const y = this.scale.height / 2 + px(BOOT.textGap) - height / 2;
    const r = height / 2;
    const g = this.bar;
    g.clear();
    g.fillStyle(COLORS.outline, 0.35).fillRoundedRect(x, y, width, height, r);
    if (share > 0) g.fillStyle(COLORS.gold, 1).fillRoundedRect(x, y, Math.max(height, width * share), height, r);
    g.lineStyle(px(2), COLORS.outline, 1).strokeRoundedRect(x, y, width, height, r);
  }

  /** Where the game starts once loaded. */
  private route(): void {
    // Dev shortcut: http://localhost:5173/?level=c01_l07 opens that level directly (even if locked).
    if (import.meta.env.DEV) {
      const levelId = new URLSearchParams(window.location.search).get('level');
      if (levelId) {
        const data: BattleSceneData = { levelId };
        this.scene.start('BattleScene', data);
        return;
      }
    }
    // An unfinished Upgrades tour (TUTORIAL.md T-6) goes on where it stopped: the map or straight into Upgrades.
    const step = tourStep(getStore(this).progress);
    if (step !== null) {
      const scene = tourScene(step);
      this.scene.start(scene, scene === 'UpgradesScene' ? { from: 'ChapterMapScene' } : {});
      return;
    }
    this.scene.start('MenuScene');
  }
}
