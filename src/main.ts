import * as Phaser from 'phaser';
import { COLORS, MAX_DPR } from './config/game';
import { resolveLangSetting } from './core/meta/settings';
import { initI18n } from './i18n/i18n';
import { MockPlatform } from './platform/MockPlatform';
import type { Platform } from './platform/Platform';
import { BattleScene } from './scenes/BattleScene';
import { BOOT_READY, BootScene } from './scenes/BootScene';
import { ChapterMapScene } from './scenes/ChapterMapScene';
import { MenuScene } from './scenes/MenuScene';
import { registerServices } from './scenes/registry';
import { UpgradesScene } from './scenes/UpgradesScene';
import { SaveStore } from './save/SaveStore';
import { display } from './view/layout';
import { preloadMusic, setMusicEnabled, setMusicSuspended, setMusicVolume } from './view/music';
import { preloadSfx, setSoundEnabled, setSoundSuspended, setSoundVolume } from './view/sound';

// No browser context menu or long-press menu anywhere in the game.
document.addEventListener('contextmenu', (e) => e.preventDefault());

function currentDpr(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_DPR);
}

/** CSS size of the game container. */
function hostSize(host: HTMLElement): { width: number; height: number } {
  return { width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) };
}

async function main(): Promise<void> {
  // TODO(stage-6): pick YandexPlatform when the SDK is available.
  const platform: Platform = new MockPlatform();
  await platform.init();
  const store = await SaveStore.load(platform);
  // The player's language choice wins over the platform's.
  initI18n(resolveLangSetting(store.settings.lang, platform.lang()));
  setSoundEnabled(store.settings.sound);
  setMusicEnabled(store.settings.music);
  setSoundVolume(store.settings.soundVolume);
  setMusicVolume(store.settings.musicVolume);

  // Dev profiler (docs/PERF.md PF-0, `npm run profile`): only with ?profile on the dev server, never in a build.
  // Loaded before the game starts, so its wrappers are in place before the first scene runs.
  const profiler = import.meta.env.DEV && new URLSearchParams(window.location.search).has('profile') ? await import('./dev/profiler') : null;

  const host = document.getElementById('game')!;
  display.dpr = currentDpr();
  const size = hostSize(host);

  // The canvas is rendered at device resolution and shown at CSS size (zoom = 1 / dpr),
  // so graphics and text stay crisp on high-density phone screens.
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    backgroundColor: COLORS.background,
    scale: {
      mode: Phaser.Scale.NONE,
      width: size.width * display.dpr,
      height: size.height * display.dpr,
      zoom: 1 / display.dpr,
    },
    input: { activePointers: 3 },
    disableContextMenu: true,
    callbacks: { preBoot: (g) => registerServices(g, platform, store) },
    scene: [BootScene, MenuScene, ChapterMapScene, UpgradesScene, BattleScene],
  });
  profiler?.installProfiler(game, window.location.search);

  const resize = (): void => {
    const dpr = currentDpr();
    const { width, height } = hostSize(host);
    if (dpr !== display.dpr) {
      display.dpr = dpr;
      game.scale.setZoom(1 / dpr);
    }
    game.scale.resize(width * dpr, height * dpr);
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  const pauseGame = (): void => {
    setSoundSuspended(true);
    setMusicSuspended(true);
    game.sound.pauseAll();
    game.loop.sleep();
  };
  const resumeGame = (): void => {
    game.loop.wake();
    game.sound.resumeAll();
    setSoundSuspended(false);
    setMusicSuspended(false);
  };
  platform.setPauseHandlers({ pause: pauseGame, resume: resumeGame });

  // Pause the game loop and sound while the tab is hidden (the battle also opens its pause panel),
  // and write pending saves: the tab may never come back.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseGame();
      store.flush();
    } else {
      resumeGame();
    }
  });

  // Signal readiness when the loading screen is done (BootScene warms the shaders up, docs/PERF.md PF-6); audio files
  // load in the background after that.
  game.events.once(BOOT_READY, () => {
    platform.ready();
    preloadSfx();
    preloadMusic();
  });
}

void main();
