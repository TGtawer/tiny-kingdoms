import { BONUSES, SPELL_IDS, SPELL_UPGRADES, STARS, type SpellId } from '../../config/balance';
import { BONUS_IDS, defaultProgress, type BonusId, type Progress } from '../meta/Progress';
import { spellSlots } from '../meta/spellbook';
import { totalStars } from '../meta/stars';

/** Bump when the shape changes, and add a migration from the previous version. */
export const SAVE_VERSION = 6;

export interface SaveData {
  version: number;
  /** ms since epoch; the newer of cloud/local wins on load. */
  updatedAt: number;
  progress: Progress;
  settings: Settings;
  // TODO(stage-6): purchases (remove_ads); TODO(stage-7): language setting.
}

/** Player settings kept between sessions. */
export interface Settings {
  /** Sound effects and vibration. */
  sound: boolean;
  /** Music and jingles. */
  music: boolean;
}

export function defaultSettings(): Settings {
  return { sound: true, music: true };
}

export function defaultSave(now = 0): SaveData {
  return { version: SAVE_VERSION, updatedAt: now, progress: defaultProgress(), settings: defaultSettings() };
}

/** Migrations by source version: MIGRATIONS[n] turns a version-n object into version n+1. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Record<number, Migration> = {
  // v2 added settings; v1 saves start with the defaults.
  1: (d) => ({ ...d, version: 2, settings: defaultSettings() }),
  // v3 added progress.stars; older saves have no stars yet (sanitizeProgress fills an empty map).
  2: (d) => ({ ...d, version: 3 }),
  // v4: spell upgrades cost stars; progress.spentStars starts at 0 (levels bought with crystals are kept).
  3: (d) => ({ ...d, version: 4 }),
  // v5: spells are chosen per slot and one is active. Keep what v4 had open by its fixed thresholds.
  4: (d) => {
    const progress = isObject(d.progress) ? d.progress : {};
    const stars = isObject(progress.stars) ? Object.values(progress.stars).reduce<number>((sum, v) => sum + num(v, 0), 0) : 0;
    const open = [...(stars >= 3 ? ['fireball'] : []), ...(stars >= 12 ? ['reinforcement'] : [])];
    return { ...d, version: 5, progress: { ...progress, openSpells: open, activeSpell: open[0] ?? null } };
  },
  // v6 added settings.music; it starts on (sanitizeSettings fills the default).
  5: (d) => ({ ...d, version: 6 }),
};

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
    settings: sanitizeSettings(obj.settings),
  };
}

function sanitizeSettings(raw: unknown): Settings {
  const settings = defaultSettings();
  if (isObject(raw) && typeof raw.sound === 'boolean') settings.sound = raw.sound;
  if (isObject(raw) && typeof raw.music === 'boolean') settings.music = raw.music;
  return settings;
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
  if (isObject(raw.stars)) {
    for (const [id, value] of Object.entries(raw.stars)) {
      const stars = level(value, STARS.max);
      if (stars > 0) progress.stars[id] = stars;
    }
  }
  progress.spentStars = Math.min(totalStars(progress), Math.max(0, Math.floor(num(raw.spentStars, 0))));
  if (Array.isArray(raw.openSpells)) {
    const open = [...new Set(raw.openSpells.filter((s): s is SpellId => SPELL_IDS.includes(s as SpellId)))];
    // Never more spells than slots.
    progress.openSpells = open.slice(0, spellSlots(progress));
  }
  const active = raw.activeSpell as SpellId;
  progress.activeSpell = progress.openSpells.includes(active) ? active : (progress.openSpells[0] ?? null);
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
