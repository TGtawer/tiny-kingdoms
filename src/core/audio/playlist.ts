import type { JingleId, MusicId } from '../../config/game';
import type { LevelData } from '../level/schema';

// Which track plays where (docs/AUDIO.md A-2). Pure: `available` is the set of IDs that have a file,
// so a missing track falls back instead of playing silence where a fallback exists.

export type Available = ReadonlySet<MusicId | JingleId>;

/**
 * Chapter map and upgrades screen share one track (the ID `music_upgrades` is historical), so moving
 * between them keeps it playing; the menu track while it has no file.
 */
export function mapTrack(available: Available): MusicId | null {
  if (available.has('music_upgrades')) return 'music_upgrades';
  return available.has('music_menu') ? 'music_menu' : null;
}

/**
 * Battle track: boss levels get `music_boss` when it has a file; otherwise the rotation
 * N = (index in chapter - 1) mod count over the battle tracks that have a file.
 * The same level always gets the same track.
 */
export function battleTrack(
  level: Pick<LevelData, 'index' | 'special'>,
  rotation: readonly MusicId[],
  available: Available,
): MusicId | null {
  if (level.special && available.has('music_boss')) return 'music_boss';
  const tracks = rotation.filter((id) => available.has(id));
  if (tracks.length === 0) return null;
  return tracks[(level.index - 1) % tracks.length] ?? null;
}

/** Jingle for the result panel, or null when none has a file (the synthesized effect plays instead). */
export function resultJingle(won: boolean, stars: number, chapterDone: boolean, available: Available): JingleId | null {
  if (!won) return available.has('jingle_defeat') ? 'jingle_defeat' : null;
  if (chapterDone && available.has('jingle_chapter')) return 'jingle_chapter';
  if (stars >= 3 && available.has('jingle_victory_3star')) return 'jingle_victory_3star';
  return available.has('jingle_victory') ? 'jingle_victory' : null;
}
