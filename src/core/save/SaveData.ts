import type { Lang } from '../../i18n/i18n';
import { BONUSES, BUILDING_TYPES, SPELL_IDS, SPELL_UPGRADES, STARS, type BuildingType, type SpellId } from '../../config/balance';
import { BONUS_IDS, defaultProgress, type BonusId, type Progress } from '../meta/Progress';
import { TOUR_STEPS, type TourState, type TourStep } from '../meta/onboarding';
import { clampVolume, DEFAULT_VOLUME } from '../meta/settings';
import { totalStars } from '../meta/stars';

/** Bump when the shape changes, and add a migration from the previous version. */
export const SAVE_VERSION = 10;

export interface SaveData {
  version: number;
  /** ms since epoch; the newer of cloud/local wins on load. */
  updatedAt: number;
  progress: Progress;
  settings: Settings;
  // TODO(stage-6): purchases (remove_ads).
}

/** Player settings kept between sessions. */
export interface Settings {
  /** Sound effects and vibration. */
  sound: boolean;
  /** Music and jingles. */
  music: boolean;
  /** Effects volume, 0..1: a multiplier on SFX.volume. Kept while the sound is off. */
  soundVolume: number;
  /** Music and jingle volume, 0..1: a multiplier on MUSIC.volume. Kept while the music is off. */
  musicVolume: number;
  /** The player's language; null = the platform's language. */
  lang: Lang | null;
}

export function defaultSettings(): Settings {
  return { sound: true, music: true, soundVolume: DEFAULT_VOLUME, musicVolume: DEFAULT_VOLUME, lang: null };
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
  // v7 (TUTORIAL.md T-3): spells come from the story, not from star slots. Slot choices are dropped,
  // stars spent on spell upgrades come back, and the spells the story has already given are unlocked.
  6: (d) => {
    const progress: Record<string, unknown> = isObject(d.progress) ? { ...d.progress } : {};
    delete progress.openSpells;
    const completed = Array.isArray(progress.completed) ? progress.completed : [];
    const unlocked = [...(completed.includes('c01_l06') ? ['reinforcement'] : []), ...(completed.includes('c01_l10') ? ['fireball'] : [])];
    return {
      ...d,
      version: 7,
      progress: { ...progress, spellUpgrades: {}, spentStars: 0, unlockedSpells: unlocked, activeSpell: unlocked[0] ?? null },
    };
  },
  // v8 (TUTORIAL.md T-6): the Upgrades tour. Players who already won level 6 count it as done.
  7: (d) => {
    const progress: Record<string, unknown> = isObject(d.progress) ? { ...d.progress } : {};
    const completed = Array.isArray(progress.completed) ? progress.completed : [];
    progress.onboarding = { upgradesTour: completed.includes('c01_l06') ? 'done' : 'pending' };
    return { ...d, version: 8, progress };
  },
  // v9 (PLAYTEST-1 F-5): buildings open once built on their lesson. A won lesson counts as learned.
  8: (d) => {
    const progress: Record<string, unknown> = isObject(d.progress) ? { ...d.progress } : {};
    const completed = Array.isArray(progress.completed) ? progress.completed : [];
    progress.learned = [...(completed.includes('c01_l03') ? ['barracks'] : []), ...(completed.includes('c01_l05') ? ['tower'] : [])];
    return { ...d, version: 9, progress };
  },
  // v10 (settings panel): volumes start full and the language follows the platform (sanitizeSettings fills them);
  // the sound and music switches are kept as they were.
  9: (d) => ({ ...d, version: 10 }),
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
  if (isObject(raw)) {
    settings.soundVolume = clampVolume(raw.soundVolume);
    settings.musicVolume = clampVolume(raw.musicVolume);
    if (raw.lang === 'ru' || raw.lang === 'en') settings.lang = raw.lang;
  }
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
  if (Array.isArray(raw.unlockedSpells)) {
    progress.unlockedSpells = [...new Set(raw.unlockedSpells.filter((s): s is SpellId => SPELL_IDS.includes(s as SpellId)))];
  }
  const active = raw.activeSpell as SpellId;
  progress.activeSpell = progress.unlockedSpells.includes(active) ? active : (progress.unlockedSpells[0] ?? null);
  if (Array.isArray(raw.learned)) {
    progress.learned = [...new Set(raw.learned.filter((b): b is BuildingType => BUILDING_TYPES.includes(b as BuildingType)))];
  }
  const tour = isObject(raw.onboarding) ? raw.onboarding.upgradesTour : undefined;
  if (tour === 'done' || tour === 'pending' || TOUR_STEPS.includes(tour as TourStep)) {
    progress.onboarding.upgradesTour = tour as TourState;
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
