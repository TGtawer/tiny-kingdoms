import type * as Phaser from 'phaser';
import type { Platform } from '../platform/Platform';
import type { SaveStore } from '../save/SaveStore';

const PLATFORM_KEY = 'platform';
const STORE_KEY = 'saveStore';

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

export function getStore(scene: Phaser.Scene): SaveStore {
  const store = scene.registry.get(STORE_KEY) as SaveStore | undefined;
  if (!store) throw new Error('SaveStore is not registered');
  return store;
}
