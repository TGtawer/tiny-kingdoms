import * as Phaser from 'phaser';
import { COLORS } from '../config/game';
import { currentLevel } from '../core/meta/Progress';
import { t } from '../i18n/i18n';
import { ALL_LEVELS, FIRST_LEVEL } from '../levels';
import { px, textStyle } from '../view/layout';
import { crystalCounter, drawMeadow, textButton } from '../view/ui';
import type { BattleSceneData } from './BattleScene';
import { getStore } from './registry';

/** Main menu: title, Play (→ the next level right away), Map, Upgrades. */
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

    const progress = getStore(this).progress;
    crystalCounter(this, w - px(14), px(30), progress.crystals);

    const titleSize = Math.min(56, (w / px(1)) * 0.12);
    this.add
      .text(w / 2, h * 0.28, t('game.title'), textStyle(titleSize, COLORS.gold))
      .setOrigin(0.5)
      .setStroke('#1f2937', px(8));

    const level = currentLevel(progress, ALL_LEVELS) ?? FIRST_LEVEL;
    const bw = Math.min(w - px(48), px(300));
    const bh = px(64);
    const step = bh + px(18);
    const top = h * 0.5;
    textButton(this, w / 2, top, bw, bh, t('menu.playLevel', { index: level.index }), () => {
      const data: BattleSceneData = { levelId: level.id };
      this.scene.start('BattleScene', data);
    }, 26);
    textButton(this, w / 2, top + step, bw, bh, t('menu.map'), () => this.scene.start('ChapterMapScene'));
    textButton(this, w / 2, top + step * 2, bw, bh, t('menu.upgrades'), () =>
      this.scene.start('UpgradesScene', { from: 'MenuScene' }),
    );
  }
}
