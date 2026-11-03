import * as Phaser from 'phaser';
import { COLORS, FONT_FAMILY, cssColor } from '../config/game';
import { t } from '../i18n/i18n';

/** Stage 0 placeholder: an empty scene with the game title, re-centered on resize. */
export class BootScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;

  constructor() {
    super('BootScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);

    this.title = this.add
      .text(0, 0, t('game.title'), {
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: cssColor(COLORS.text),
      })
      .setOrigin(0.5);

    this.layout(this.scale.gameSize);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  private layout(size: Phaser.Structs.Size): void {
    const { width, height } = size;
    this.cameras.main.setSize(width, height);
    this.title.setPosition(width / 2, height / 2);
    this.title.setFontSize(Math.round(Math.min(width, height) * 0.1));
  }
}
