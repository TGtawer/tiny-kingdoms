import * as Phaser from 'phaser';
import { COLORS } from '../config/game';

/** First scene. Nothing to load yet (graphics are drawn in code), so it goes straight to the battle. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    // TODO(stage-5): go to MenuScene / ChapterMapScene instead.
    this.scene.start('BattleScene');
  }
}
