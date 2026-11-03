import * as Phaser from 'phaser';
import { COLORS } from '../config/game';
import { t } from '../i18n/i18n';
import { px, textStyle } from '../view/layout';
import { crystalCounter, drawMeadow, textButton } from '../view/ui';
import { getStore } from './registry';

/** Main menu: title, Play (→ chapter map), Upgrades. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this));
  }

  private build(): void {
    this.children.removeAll(true);
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    drawMeadow(this.add.graphics(), w, h);

    crystalCounter(this, w - px(14), px(30), getStore(this).progress.crystals);

    const titleSize = Math.min(56, (w / px(1)) * 0.12);
    this.add
      .text(w / 2, h * 0.3, t('game.title'), textStyle(titleSize, COLORS.gold))
      .setOrigin(0.5)
      .setStroke('#1f2937', px(8));

    const bw = Math.min(w - px(48), px(300));
    const bh = px(64);
    textButton(this, w / 2, h * 0.56, bw, bh, t('menu.play'), () => this.scene.start('ChapterMapScene'), 26);
    textButton(this, w / 2, h * 0.56 + bh + px(18), bw, bh, t('menu.upgrades'), () =>
      this.scene.start('UpgradesScene', { from: 'MenuScene' }),
    );
  }
}
