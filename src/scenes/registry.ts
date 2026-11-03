import type * as Phaser from 'phaser';
import type { Platform } from '../platform/Platform';

const PLATFORM_KEY = 'platform';

/** Stores the platform in the game registry so scenes can reach it without globals. */
export function setPlatform(game: Phaser.Game, platform: Platform): void {
  game.registry.set(PLATFORM_KEY, platform);
}

export function getPlatform(scene: Phaser.Scene): Platform {
  const platform = scene.registry.get(PLATFORM_KEY) as Platform | undefined;
  if (!platform) throw new Error('Platform is not registered');
  return platform;
}
