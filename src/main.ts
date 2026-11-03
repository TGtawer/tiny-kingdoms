import * as Phaser from 'phaser';
import { COLORS } from './config/game';
import { initI18n } from './i18n/i18n';
import { MockPlatform } from './platform/MockPlatform';
import type { Platform } from './platform/Platform';
import { BootScene } from './scenes/BootScene';

// No browser context menu or long-press menu anywhere in the game.
document.addEventListener('contextmenu', (e) => e.preventDefault());

async function main(): Promise<void> {
  // TODO(stage-6): pick YandexPlatform when the SDK is available.
  const platform: Platform = new MockPlatform();
  await platform.init();
  // TODO(stage-5): load save data here.
  initI18n(platform.lang());

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: COLORS.background,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    input: { activePointers: 3 },
    disableContextMenu: true,
    scene: [BootScene],
  });

  const pauseGame = (): void => {
    game.sound.pauseAll();
    game.loop.sleep();
  };
  const resumeGame = (): void => {
    game.loop.wake();
    game.sound.resumeAll();
  };
  platform.setPauseHandlers({ pause: pauseGame, resume: resumeGame });

  // Pause the game and sound while the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
    else resumeGame();
  });

  // Signal readiness after the first frame has been rendered.
  game.events.once(Phaser.Core.Events.POST_RENDER, () => platform.ready());
}

void main();
