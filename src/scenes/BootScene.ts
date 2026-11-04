import * as Phaser from 'phaser';
import { COLORS } from '../config/game';
import { tourScene, tourStep } from '../core/meta/onboarding';
import { FIRST_LEVEL } from '../levels';
import type { BattleSceneData } from './BattleScene';
import { getStore } from './registry';

/**
 * First scene. Nothing to load yet (graphics are drawn in code): goes to the main menu,
 * into the first battle on the very first launch, or back into an unfinished Upgrades tour.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    // Dev shortcut: http://localhost:5173/?level=c01_l07 opens that level directly (even if locked).
    if (import.meta.env.DEV) {
      const levelId = new URLSearchParams(window.location.search).get('level');
      if (levelId) {
        const data: BattleSceneData = { levelId };
        this.scene.start('BattleScene', data);
        return;
      }
    }
    // First launch: straight into level 1 with its tutorial, skipping the menu and the map.
    if (getStore(this).progress.completed.length === 0) {
      const data: BattleSceneData = { levelId: FIRST_LEVEL.id };
      this.scene.start('BattleScene', data);
      return;
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
