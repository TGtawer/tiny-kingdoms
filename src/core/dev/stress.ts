import type { Command } from '../sim/commands';
import { armyPath } from '../sim/pathfinding';
import { spawnUnit } from '../sim/units';
import { isAttacked, type Side, type World } from '../sim/World';

/**
 * Stress driver for performance checks (ARCHITECTURE.md «Производительность»): `npm run bench` and the dev level
 * `dev_stress`. Not game logic — it bends the rules to keep the field full:
 * - every garrison is kept at `minTroops`, so no node falls and streams never run dry;
 * - every idle node streams to a foreign node it has a route to (through its own nodes to the front);
 * - extra units are put on roads between nodes of one side until `targetUnits` are on the field.
 * Deterministic: choices come from a private LCG, not from the world RNG.
 */
export interface StressState {
  rng: number;
}

export function createStress(): StressState {
  return { rng: 12345 };
}

function rand(state: StressState): number {
  state.rng = (state.rng * 1103515245 + 12345) & 0x7fffffff;
  return state.rng / 0x7fffffff;
}

/** Call before every `step`; returns the stream orders for this tick. */
export function stressStep(world: World, state: StressState, targetUnits: number, minTroops = 60): Command[] {
  const commands: Command[] = [];
  const nodes = Object.values(world.nodes);
  for (const node of nodes) {
    if (node.owner === 'neutral') continue;
    node.troops = Math.max(node.troops, minTroops);
    if (node.streams > 0 || isAttacked(world, node)) continue;
    const side = node.owner as Side;
    // A random foreign node with a route (a few tries; idle nodes try again next tick).
    for (let attempt = 0; attempt < 4; attempt++) {
      const target = nodes[Math.floor(rand(state) * nodes.length)]!;
      if (target.owner === side || !armyPath(world, side, node.id, target.id)) continue;
      commands.push({ type: 'send', side, from: node.id, to: target.id });
      break;
    }
  }
  for (let tries = 0; world.units.length < targetUnits && tries < targetUnits * 4; tries++) {
    const laneIdx = Math.floor(rand(state) * world.lanes.length);
    const lane = world.lanes[laneIdx]!;
    const owner = world.nodes[lane.from]!.owner;
    if (lane.portal || world.nodes[lane.to]!.owner !== owner) continue;
    spawnUnit(world, owner, { path: [lane.from, lane.to], lanes: [laneIdx], next: null }, lane.startP + rand(state) * (lane.endP - lane.startP) * 0.9);
  }
  return commands;
}
