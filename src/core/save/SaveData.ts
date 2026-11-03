import { BONUSES, SPELL_IDS, SPELL_UPGRADES, type SpellId } from '../../config/balance';
import { BONUS_IDS, defaultProgress, type BonusId, type Progress } from '../meta/Progress';

/** Bump when the shape changes, and add a migration from the previous version. */
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  /** ms since epoch; the newer of cloud/local wins on load. */
  updatedAt: number;
  progress: Progress;
  // TODO(stage-6): purchases (remove_ads); TODO(stage-7): settings (sound, music, language).
}

export function defaultSave(now = 0): SaveData {
  return { version: SAVE_VERSION, updatedAt: now, progress: defaultProgress() };
}

/** Migrations by source version: MIGRATIONS[n] turns a version-n object into version n+1. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Record<number, Migration> = {};

/**
 * Turns anything read from storage into valid SaveData: runs migrations, fills missing fields
 * with defaults and drops garbage. Never throws; unreadable data becomes a fresh save.
 */
export function parseSave(raw: unknown, migrations: Record<number, Migration> = MIGRATIONS): SaveData {
  let data: unknown = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return defaultSave();
    }
  }
  if (!isObject(data)) return defaultSave();

  let obj: Record<string, unknown> = data;
  let version = typeof obj.version === 'number' && Number.isInteger(obj.version) ? obj.version : 0;
  while (version < SAVE_VERSION) {
    const migrate = migrations[version];
    if (migrate) obj = migrate(obj);
    version += 1;
  }

  return {
    version: SAVE_VERSION,
    updatedAt: num(obj.updatedAt, 0),
    progress: sanitizeProgress(obj.progress),
  };
}

function sanitizeProgress(raw: unknown): Progress {
  const progress = defaultProgress();
  if (!isObject(raw)) return progress;
  progress.crystals = Math.max(0, Math.floor(num(raw.crystals, 0)));
  if (Array.isArray(raw.completed)) {
    progress.completed = [...new Set(raw.completed.filter((id): id is string => typeof id === 'string'))];
  }
  if (isObject(raw.bonuses)) {
    for (const id of BONUS_IDS) progress.bonuses[id as BonusId] = level(raw.bonuses[id], BONUSES.maxLevel);
  }
  if (isObject(raw.spellUpgrades)) {
    for (const id of SPELL_IDS) progress.spellUpgrades[id as SpellId] = level(raw.spellUpgrades[id], SPELL_UPGRADES.maxLevel);
  }
  return progress;
}

/** Picks the newer of two saves (cloud vs local). */
export function newerSave(a: SaveData | null, b: SaveData | null): SaveData | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

export function serializeSave(save: SaveData): string {
  return JSON.stringify(save);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Upgrade levels are integers in 0..max. */
function level(v: unknown, max: number): number {
  return Math.min(max, Math.max(0, Math.floor(num(v, 0))));
}
