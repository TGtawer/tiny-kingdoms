import type { Command } from '../sim/commands';
import { isAttacked, type Side, type World } from '../sim/World';

/**
 * Driver of the dev level `dev_contest` (docs/PLAYTEST-1.md F-2): two castles of each side stream into the small neutral `mid`
 * at the same time, so its owner flips on almost every unit — a manual check that the node's count and color
 * don't flicker. Not game logic: it tops the castles up before every round and replaces the AI. After `rounds`
 * rounds it stops, and the node must settle on its real state.
 */
/**
 * Two castles a side: the two columns of a side arrive in the same tick, the other side's one tick later, so the
 * owner flips on every tick (with one column a side the arrivals alternate and the node never changes hands).
 */
const SOURCES: ReadonlyArray<readonly [string, Side]> = [
  ['player', 'player'],
  ['player2', 'player'],
  ['enemy', 'enemy'],
  ['enemy2', 'enemy'],
];

export interface ContestState {
  roundsLeft: number;
}

export function createContest(rounds = 3): ContestState {
  return { roundsLeft: rounds };
}

/** Call before every `step`; starts a round when the field is quiet. */
export function contestStep(world: World, state: ContestState, troops = 60): Command[] {
  if (state.roundsLeft <= 0 || world.units.length > 0 || world.streams.length > 0) return [];
  const castles = SOURCES.map(([id, side]) => ({ node: world.nodes[id], side }));
  if (castles.some(({ node, side }) => !node || node.owner !== side || isAttacked(world, node))) return [];
  state.roundsLeft--;
  return castles.map(({ node, side }) => {
    node!.troops = Math.max(node!.troops, troops);
    return { type: 'send', side, from: node!.id, to: 'mid' } as const;
  });
}
