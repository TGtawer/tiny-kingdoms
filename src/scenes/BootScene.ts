import * as Phaser from 'phaser';
import { COLORS } from '../config/game';
import { parseBuildButtonStyle } from '../core/meta/buildButtonStyle';
import { parseMenuFocus } from '../core/meta/menuFocus';
import { tourScene, tourStep } from '../core/meta/onboarding';
import type { BattleSceneData } from './BattleScene';
import { getStore, setBuildButtonStyleOverride, setMenuFocusOverride } from './registry';

/**
 * First scene. Nothing to load yet (graphics are drawn in code): always goes to the main menu (PLAYTEST-1 F-1;
 * on the first launch it is in the focus mode), except back into an unfinished Upgrades tour.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    // ?menuFocus=on|off: compare the menu with and without the focus mode (production builds too).
    setMenuFocusOverride(this, parseMenuFocus(window.location.search));
    // ?buildBtn=grey|fill: compare the two looks of an unaffordable build button (BUILD-BUTTON BB-3).
    setBuildButtonStyleOverride(this, parseBuildButtonStyle(window.location.search));
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
