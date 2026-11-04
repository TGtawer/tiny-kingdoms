import * as Phaser from 'phaser';
import { COLORS, MENU_LAYOUT } from '../config/game';
import { currentLevel } from '../core/meta/Progress';
import { t } from '../i18n/i18n';
import { ALL_LEVELS, FIRST_LEVEL } from '../levels';
import { px, textStyle } from '../view/layout';
import { crystalCounter, drawFlowers, drawMeadow, textButton } from '../view/ui';
import type { BattleSceneData } from './BattleScene';
import { getStore } from './registry';

/** Main menu on a flowery meadow: title, Play (→ the next level right away), Map, Upgrades. */
export class MenuScene extends Phaser.Scene {
  private meadow!: Phaser.GameObjects.Graphics;
  /** Everything of the menu UI layer, rebuilt on resize. */
  private ui: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.meadow = this.add.graphics().setDepth(-1);
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this));
  }

  private build(): void {
    for (const obj of this.ui) {
      this.tweens.killTweensOf(obj);
      obj.destroy();
    }
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    this.meadow.clear();
    drawMeadow(this.meadow, w, h);
    drawFlowers(this.meadow, w, h, MENU_LAYOUT.flowerDensity, MENU_LAYOUT.flowerColors);

    const before = new Set(this.children.list);
    this.buildUi(w, h);
    this.ui = this.children.list.filter((obj) => !before.has(obj));
    for (const obj of this.ui) if (obj instanceof Phaser.GameObjects.Container || obj instanceof Phaser.GameObjects.Graphics || obj instanceof Phaser.GameObjects.Text) obj.setDepth(10);
  }

  private buildUi(w: number, h: number): void {
    const progress = getStore(this).progress;
    crystalCounter(this, w - px(14), px(30), progress.crystals);

    const level = currentLevel(progress, ALL_LEVELS) ?? FIRST_LEVEL;
    const bw = Math.min(w - px(MENU_LAYOUT.sideClearance) * 2, px(300));
    const bh = px(64);
    const gap = px(18);
    const top = h * 0.5;

    // Soft panel behind the buttons.
    const pad = px(MENU_LAYOUT.panelPadding);
    const panelW = bw + pad * 2;
    const panelH = bh * 3 + gap * 2 + pad * 2;
    const panelX = w / 2 - panelW / 2;
    const panelY = top - bh / 2 - pad;
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.outline, 0.25).fillRoundedRect(panelX + px(4), panelY + px(6), panelW, panelH, px(26));
    panel.fillStyle(COLORS.panel, MENU_LAYOUT.panelAlpha).fillRoundedRect(panelX, panelY, panelW, panelH, px(26));
    panel.lineStyle(px(4), COLORS.panelEdge, 1).strokeRoundedRect(panelX, panelY, panelW, panelH, px(26));

    // Title with a drop shadow, gently bobbing.
    const titleSize = Math.min(56, (w / px(1)) * 0.12);
    const titleY = Math.min(h * 0.28, panelY - px(titleSize) * 0.9);
    const title = this.add.container(w / 2, titleY);
    const text = this.add.text(0, 0, t('game.title'), textStyle(titleSize, COLORS.gold)).setOrigin(0.5).setStroke('#1f2937', px(8));
    // The shadow is not part of the measured text size: pad the texture so descenders (y, g) and the shadow aren't clipped.
    const shadow = px(MENU_LAYOUT.titleShadow);
    text.setShadow(0, shadow, '#1f2937', 0, true, true).setPadding(0, shadow, 0, shadow * 2);
    title.add(text);
    this.tweens.add({ targets: title, y: titleY - px(6), duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    textButton(this, w / 2, top, bw, bh, t('menu.playLevel', { index: level.index }), () => {
      const data: BattleSceneData = { levelId: level.id };
      this.scene.start('BattleScene', data);
    }, 26);
    textButton(this, w / 2, top + bh + gap, bw, bh, t('menu.map'), () => this.scene.start('ChapterMapScene'));
    textButton(this, w / 2, top + (bh + gap) * 2, bw, bh, t('menu.upgrades'), () =>
      this.scene.start('UpgradesScene', { from: 'MenuScene' }),
    );
  }
}
