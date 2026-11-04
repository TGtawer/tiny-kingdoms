import { describe, expect, it } from 'vitest';
import { LevelValidationError, loadChapter, loadLevel } from '../../../src/core/level/loader';
import { validateLevel, type LevelData } from '../../../src/core/level/schema';
import { level, node } from '../helpers';

function good(): LevelData {
  return level(
    [
      node('p', 0.1, 0.5, { owner: 'player', troops: 10 }),
      node('n', 0.5, 0.5, { troops: 5 }),
      node('e', 0.9, 0.5, { owner: 'enemy', troops: 10 }),
    ],
    [
      ['p', 'n'],
      ['n', 'e'],
    ],
  );
}

function errorsOf(mutate: (l: LevelData) => void): string[] {
  const l = good();
  mutate(l);
  const result = validateLevel(l);
  return result.ok ? [] : result.errors;
}

describe('validateLevel', () => {
  it('accepts a valid level', () => {
    expect(validateLevel(good()).ok).toBe(true);
  });

  it.each<[string, (l: LevelData) => void, string]>([
    ['duplicate node id', (l) => (l.nodes[1]!.id = 'p'), 'duplicate id'],
    ['coordinates out of range', (l) => (l.nodes[1]!.x = 1.2), 'x/y must be in 0..1'],
    ['bad size', (l) => ((l.nodes[1] as { size: string }).size = 'huge'), 'bad size'],
    ['negative troops', (l) => (l.nodes[1]!.troops = -1), 'troops must be >= 0'],
    ['mine without a gold vein', (l) => (l.nodes[1]!.building = { type: 'mine', level: 1 }), 'mine without gold vein'],
    ['bad building level', (l) => (l.nodes[1]!.building = { type: 'tower', level: 4 as 1 }), 'bad building'],
    ['no enemy', (l) => (l.nodes[2]!.owner = 'neutral'), 'no enemy start node'],
    ['no player', (l) => (l.nodes[0]!.owner = 'neutral'), 'no player start node'],
    ['road to an unknown node', (l) => l.roads.push(['p', 'x']), 'unknown node'],
    ['duplicate road', (l) => l.roads.push(['n', 'p']), 'duplicate'],
    ['road loop', (l) => l.roads.push(['n', 'n']), 'loop'],
    ['disconnected node', (l) => (l.roads = [['p', 'n']]), 'not connected'],
    ['nodes too close', (l) => (l.nodes[1]!.x = 0.15), 'too close'],
    ['road over a node', (l) => l.roads.push(['p', 'e']), 'runs over node n'],
    ['aggression out of range', (l) => (l.enemy.aggression = 2), 'aggression'],
    ['negative AI delay', (l) => (l.enemy.aiStartDelayMs = -5), 'aiStartDelayMs'],
  ])('rejects %s', (_name, mutate, message) => {
    const errors = errorsOf(mutate);
    expect(errors.some((e) => e.includes(message)), errors.join('\n')).toBe(true);
  });

  it('rejects crossing roads', () => {
    const l = level(
      [
        node('p', 0.1, 0.1, { owner: 'player' }),
        node('a', 0.9, 0.9),
        node('b', 0.1, 0.9),
        node('e', 0.9, 0.1, { owner: 'enemy' }),
      ],
      [
        ['p', 'a'],
        ['b', 'e'],
        ['p', 'b'],
      ],
    );
    const result = validateLevel(l);
    expect(result.ok ? [] : result.errors).toContainEqual(expect.stringContaining('cross'));
  });

  it('accepts one capital per side', () => {
    expect(
      errorsOf((l) => {
        l.nodes[0]!.capital = true;
        l.nodes[2]!.capital = true;
      }),
    ).toEqual([]);
  });

  it('rejects a neutral capital and a second capital of a side', () => {
    expect(errorsOf((l) => (l.nodes[1]!.capital = true))).toEqual(['test: node n: capital must start as player or enemy']);
    const errors = errorsOf((l) => {
      l.nodes[0]!.capital = true;
      l.nodes[1]!.owner = 'player';
      l.nodes[1]!.capital = true;
    });
    expect(errors).toEqual(['test: more than one player capital']);
  });

  it('rejects non-objects', () => {
    expect(validateLevel(null).ok).toBe(false);
    expect(validateLevel({ id: 'x' }).ok).toBe(false);
  });
});

describe('loader', () => {
  it('loadLevel throws with all errors listed', () => {
    const bad = good();
    bad.nodes[0]!.owner = 'neutral';
    bad.roads.push(['p', 'zzz']);
    expect(() => loadLevel(bad)).toThrow(LevelValidationError);
    try {
      loadLevel(bad);
    } catch (e) {
      expect((e as LevelValidationError).errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('loadChapter checks chapter and index order', () => {
    const a = { ...good(), id: 'a', chapter: 1, index: 1 };
    const b = { ...good(), id: 'b', chapter: 1, index: 3 };
    expect(() => loadChapter(1, [a, b])).toThrow(/index 2/);
    expect(loadChapter(1, [a])).toHaveLength(1);
  });
});
