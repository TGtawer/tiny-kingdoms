import type * as Phaser from 'phaser';
import type { BuildButtonStyle } from '../core/meta/buildButtonStyle';
import type { Platform } from '../platform/Platform';
import type { SaveStore } from '../save/SaveStore';

const PLATFORM_KEY = 'platform';
const STORE_KEY = 'saveStore';
const MENU_FOCUS_KEY = 'menuFocusOverride';
const BUILD_BUTTON_KEY = 'buildButtonStyleOverride';

/** Stores services in the game registry so scenes can reach them without globals. */
export function registerServices(game: Phaser.Game, platform: Platform, store: SaveStore): void {
  game.registry.set(PLATFORM_KEY, platform);
  game.registry.set(STORE_KEY, store);
}

export function getPlatform(scene: Phaser.Scene): Platform {
  const platform = scene.registry.get(PLATFORM_KEY) as Platform | undefined;
  if (!platform) throw new Error('Platform is not registered');
  return platform;
}

/** `?menuFocus=on|off` read at boot (PLAYTEST-1 F-1); null when the parameter is absent. */
export function setMenuFocusOverride(scene: Phaser.Scene, value: boolean | null): void {
  scene.registry.set(MENU_FOCUS_KEY, value);
}

export function getMenuFocusOverride(scene: Phaser.Scene): boolean | null {
  return (scene.registry.get(MENU_FOCUS_KEY) as boolean | null | undefined) ?? null;
}

/** `?buildBtn=grey|fill` read at boot (BUILD-BUTTON BB-3); null when the parameter is absent. */
export function setBuildButtonStyleOverride(scene: Phaser.Scene, value: BuildButtonStyle | null): void {
  scene.registry.set(BUILD_BUTTON_KEY, value);
}

export function getBuildButtonStyleOverride(scene: Phaser.Scene): BuildButtonStyle | null {
  return (scene.registry.get(BUILD_BUTTON_KEY) as BuildButtonStyle | null | undefined) ?? null;
}

export function getStore(scene: Phaser.Scene): SaveStore {
  const store = scene.registry.get(STORE_KEY) as SaveStore | undefined;
  if (!store) throw new Error('SaveStore is not registered');
  return store;
}
