import { describe, expect, it } from 'vitest';
import type { JingleId, MusicId } from '../../../src/config/game';
import { battleTrack, mapTrack, resultJingle } from '../../../src/core/audio/playlist';

const ROTATION: MusicId[] = ['music_battle_1', 'music_battle_2', 'music_battle_3'];
const all = (...ids: Array<MusicId | JingleId>): Set<MusicId | JingleId> => new Set(ids);

describe('battle track rotation', () => {
  const three = all('music_battle_1', 'music_battle_2', 'music_battle_3');

  it('cycles by the level index in the chapter', () => {
    expect([1, 2, 3, 4, 5].map((index) => battleTrack({ index }, ROTATION, three))).toEqual([
      'music_battle_1',
      'music_battle_2',
      'music_battle_3',
      'music_battle_1',
      'music_battle_2',
    ]);
  });

  it('counts only the tracks that have a file', () => {
    const two = all('music_battle_1', 'music_battle_3');
    expect([1, 2, 3].map((index) => battleTrack({ index }, ROTATION, two))).toEqual(['music_battle_1', 'music_battle_3', 'music_battle_1']);
  });

  it('is null without any battle track', () => {
    expect(battleTrack({ index: 1 }, ROTATION, all('music_menu'))).toBeNull();
  });

  it('boss levels use music_boss only when it has a file', () => {
    const boss = { index: 10, special: { type: 'dragon' as const, params: {} } };
    expect(battleTrack(boss, ROTATION, three)).toBe('music_battle_1');
    expect(battleTrack(boss, ROTATION, all('music_battle_1', 'music_boss'))).toBe('music_boss');
  });
});

describe('map and upgrades track', () => {
  it('is music_upgrades, falling back to the menu track', () => {
    expect(mapTrack(all('music_menu', 'music_upgrades'))).toBe('music_upgrades');
    expect(mapTrack(all('music_menu'))).toBe('music_menu');
    expect(mapTrack(all())).toBeNull();
  });
});

describe('result jingle', () => {
  const jingles = all('jingle_victory', 'jingle_victory_3star', 'jingle_defeat');

  it('picks by outcome and stars', () => {
    expect(resultJingle(false, 0, false, jingles)).toBe('jingle_defeat');
    expect(resultJingle(true, 1, false, jingles)).toBe('jingle_victory');
    expect(resultJingle(true, 2, false, jingles)).toBe('jingle_victory');
    expect(resultJingle(true, 3, false, jingles)).toBe('jingle_victory_3star');
  });

  it('chapter jingle wins when it has a file, otherwise the stars decide', () => {
    expect(resultJingle(true, 3, true, jingles)).toBe('jingle_victory_3star');
    expect(resultJingle(true, 1, true, all('jingle_chapter', 'jingle_victory'))).toBe('jingle_chapter');
  });

  it('falls back from 3 stars to the normal victory, and to null without files', () => {
    expect(resultJingle(true, 3, false, all('jingle_victory'))).toBe('jingle_victory');
    expect(resultJingle(true, 3, false, all())).toBeNull();
    expect(resultJingle(false, 0, false, all('jingle_victory'))).toBeNull();
  });
});
