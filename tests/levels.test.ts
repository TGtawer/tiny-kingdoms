import { describe, expect, it } from 'vitest';
import { towerDamage } from '../src/core/sim/combat';
import { sendAmount, type Command } from '../src/core/sim/commands';
import { findPath, pathLength } from '../src/core/sim/pathfinding';
import { step } from '../src/core/sim/tick';
import { createWorld, type World } from '../src/core/sim/World';
import { ALL_LEVELS, TEST_LEVEL } from '../src/levels';

// TODO(stage-4): replace with schema validation in src/core/level/schema.ts.
describe.each(ALL_LEVELS.map((l) => [l.id, l] as const))('level %s', (_id, level) => {
  it('has unique node ids and roads between existing nodes', () => {
    const ids = level.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [a, b] of level.roads) {
      expect(ids).toContain(a);
      expect(ids).toContain(b);
      expect(a).not.toBe(b);
    }
  });

  it('coordinates are normalized and the graph is connected', () => {
    const world = createWorld(level);
    const [first, ...rest] = level.nodes;
    for (const n of level.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(1);
    }
    for (const n of rest) expect(findPath(world.nodes, world.roads, first!.id, n.id), n.id).not.toBeNull();
  });

  it('has one player and one enemy start', () => {
    expect(level.nodes.some((n) => n.owner === 'player')).toBe(true);
    expect(level.nodes.some((n) => n.owner === 'enemy')).toBe(true);
  });
});

/**
 * Simple scripted player: front nodes attack the weakest adjacent foreign node when they can win;
 * rear nodes push troops towards the enemy base. Not an AI — just proof the level is winnable.
 */
function scriptedPlayer(world: World, enemyBase: string): Command[] {
  const neighbors = (id: string): string[] =>
    world.roads.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []));
  const distToEnemy = (id: string): number => pathLength(world.nodes, findPath(world.nodes, world.roads, id, enemyBase)!);

  const commands: Command[] = [];
  for (const node of Object.values(world.nodes)) {
    if (node.owner !== 'player') continue;
    const send = sendAmount(node.troops);
    if (send === 0) continue;

    const foreign = neighbors(node.id)
      .map((id) => world.nodes[id]!)
      .filter((n) => n.owner !== 'player');
    if (foreign.length > 0) {
      const target = foreign.reduce((a, b) => (b.troops + towerDamage(b) < a.troops + towerDamage(a) ? b : a));
      if (send > target.troops + towerDamage(target) + 1) {
        commands.push({ type: 'send', side: 'player', from: node.id, to: target.id });
      }
      continue;
    }
    const closer = neighbors(node.id)
      .filter((id) => distToEnemy(id) < distToEnemy(node.id))
      .sort((a, b) => distToEnemy(a) - distToEnemy(b))[0];
    if (closer) commands.push({ type: 'send', side: 'player', from: node.id, to: closer });
  }
  return commands;
}

describe('test level', () => {
  it('can be won against an idle enemy', () => {
    const world = createWorld(TEST_LEVEL);
    // Up to 5 minutes of game time; decisions every 2 s.
    for (let i = 0; i < 3000 && !world.winner; i++) {
      step(world, i % 20 === 0 ? scriptedPlayer(world, 'enemy') : []);
    }
    expect(world.winner).toBe('player');
  });
});
