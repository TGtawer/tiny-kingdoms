import { CITADEL, TICK_MS } from '../../../config/balance';
import { armyPath, routeLength } from '../pathfinding';
import type { World } from '../World';

/** Citadel boss state (chapter 2, level 10): the enemy's fortress capital that sends extra squads. */
export interface CitadelState {
  type: 'citadel';
  nodeId: string;
  nextWaveTick: number;
}

export interface CitadelWave {
  type: 'citadelWave';
  from: string;
  to: string;
  armyId: string;
  count: number;
}

const WAVE_TICKS = Math.round(CITADEL.waveEveryMs / TICK_MS);

export function createCitadel(nodeId: string): CitadelState {
  return { type: 'citadel', nodeId, nextWaveTick: WAVE_TICKS };
}

/**
 * Every CITADEL.waveEveryMs, while the citadel belongs to the enemy, a squad of CITADEL.waveSize troops
 * (on top of the garrison) marches to the nearest player node it has a route to.
 */
export function stepCitadel(world: World, citadel: CitadelState): CitadelWave[] {
  if (world.tick < citadel.nextWaveTick) return [];
  citadel.nextWaveTick += WAVE_TICKS;
  const node = world.nodes[citadel.nodeId];
  if (!node || node.owner !== 'enemy') return [];

  let best: { id: string; path: string[]; length: number } | null = null;
  for (const target of Object.values(world.nodes)) {
    if (target.owner !== 'player') continue;
    const path = armyPath(world, 'enemy', node.id, target.id);
    if (!path) continue;
    const length = routeLength(world, path);
    if (!best || length < best.length) best = { id: target.id, path, length };
  }
  if (!best) return [];

  const armyId = `a${world.nextArmyId++}`;
  world.armies.push({ id: armyId, owner: 'enemy', count: CITADEL.waveSize, path: best.path, segment: 0, progress: 0, targetId: best.id });
  return [{ type: 'citadelWave', from: node.id, to: best.id, armyId, count: CITADEL.waveSize }];
}
