import * as Phaser from 'phaser';
import { COLORS } from '../config/game';
import type { BattleSceneData } from './BattleScene';

/** First scene. Nothing to load yet (graphics are drawn in code), so it goes straight to the battle. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    const data: BattleSceneData = {};
    // Dev shortcut: http://localhost:5173/?level=c01_l07 opens that level directly.
    if (import.meta.env.DEV) {
      const levelId = new URLSearchParams(window.location.search).get('level');
      if (levelId) data.levelId = levelId;
    }
    // TODO(stage-5): go to MenuScene / ChapterMapScene instead.
    this.scene.start('BattleScene', data);
  }
}
