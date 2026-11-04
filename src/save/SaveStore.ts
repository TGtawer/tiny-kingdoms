import type { Progress } from '../core/meta/Progress';
import { newerSave, parseSave, serializeSave, type SaveData, type Settings } from '../core/save/SaveData';
import type { Platform } from '../platform/Platform';

const LOCAL_KEY = 'tiny-kingdoms.save';
/** Platform saves are throttled to one write per this interval (ARCHITECTURE: "not more often than every few seconds"). */
const MIN_WRITE_INTERVAL_MS = 3000;

/**
 * Holds the current save in memory. Loads both the platform (cloud) copy and the localStorage copy
 * and keeps the newer one; writes go to both, throttled.
 */
export class SaveStore {
  private lastWrite = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  private constructor(
    private readonly platform: Platform,
    private data: SaveData,
  ) {}

  static async load(platform: Platform): Promise<SaveStore> {
    let cloud: SaveData | null = null;
    try {
      const raw = await platform.load();
      if (raw) cloud = parseSave(raw);
    } catch {
      // Cloud unavailable: fall back to the local copy.
    }
    let local: SaveData | null = null;
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) local = parseSave(raw);
    } catch {
      // localStorage blocked (private mode, sandbox).
    }
    return new SaveStore(platform, newerSave(cloud, local) ?? parseSave(null));
  }

  get progress(): Progress {
    return this.data.progress;
  }

  get settings(): Settings {
    return this.data.settings;
  }

  /** Call after changing progress or settings (level end, upgrade, purchase). */
  commit(): void {
    this.data.updatedAt = Date.now();
    this.dirty = true;
    const wait = this.lastWrite + MIN_WRITE_INTERVAL_MS - Date.now();
    if (wait <= 0) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), wait);
    }
  }

  /** Writes now if there are unsaved changes (e.g. when the tab is hidden). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.lastWrite = Date.now();
    const json = serializeSave(this.data);
    try {
      localStorage.setItem(LOCAL_KEY, json);
    } catch {
      // Best effort.
    }
    void this.platform.save(json).catch(() => {
      // Cloud write failed; the local copy is still there, next commit retries.
      this.dirty = true;
    });
  }
}
