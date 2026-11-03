import { describe, expect, it } from 'vitest';
import { findPath, pathLength } from '../../../src/core/sim/pathfinding';
import { createWorld } from '../../../src/core/sim/World';
import { level, node } from '../helpers';

//   A(0,0) — B(0.5,0) — C(1,0)
//    \                 /
//     D(0.5,0.9) ———— /       A–D–C is longer than A–B–C.
//   F is isolated.
const world = createWorld(
  level(
    [node('A', 0, 0), node('B', 0.5, 0), node('C', 1, 0), node('D', 0.5, 0.9), node('F', 0.5, 0.5)],
    [
      ['A', 'B'],
      ['B', 'C'],
      ['A', 'D'],
      ['D', 'C'],
    ],
  ),
);

describe('findPath', () => {
  it('finds the shortest path by road length', () => {
    expect(findPath(world.nodes, world.roads, 'A', 'C')).toEqual(['A', 'B', 'C']);
    expect(pathLength(world.nodes, ['A', 'B', 'C'])).toBeCloseTo(1);
  });

  it('takes the detour when the direct road is missing', () => {
    const roads = world.roads.filter(([a, b]) => !(a === 'B' && b === 'C'));
    expect(findPath(world.nodes, roads, 'A', 'C')).toEqual(['A', 'D', 'C']);
  });

  it('roads are two-way', () => {
    expect(findPath(world.nodes, world.roads, 'C', 'A')).toEqual(['C', 'B', 'A']);
  });

  it('returns null for unreachable or unknown nodes', () => {
    expect(findPath(world.nodes, world.roads, 'A', 'F')).toBeNull();
    expect(findPath(world.nodes, world.roads, 'A', 'nope')).toBeNull();
  });

  it('canPass limits intermediate stops, but never the start or the target', () => {
    const notB = (n: { id: string }) => n.id !== 'B';
    expect(findPath(world.nodes, world.roads, 'A', 'C', notB)).toEqual(['A', 'D', 'C']);
    expect(findPath(world.nodes, world.roads, 'A', 'B', notB)).toEqual(['A', 'B']);
    expect(findPath(world.nodes, world.roads, 'A', 'C', () => false)).toBeNull();
  });

  it('path to itself is a single node', () => {
    expect(findPath(world.nodes, world.roads, 'A', 'A')).toEqual(['A']);
  });
});
