import type { NodeState, Owner } from './World';

/**
 * Changes the owner. The building passes to the new owner intact — same type, same level, a tower keeps its reload
 * state (GDD 3.4, PLAYTEST-1 F-3). Chests and bandit camps turn into normal nodes (a chest also becomes small);
 * fortresses, temples and portals keep their kind. The old owner's streams from the node break off (their units
 * that hadn't left died with the garrison, GDD 3.6): the caller drops them (stream.ts dropForeignStreams).
 */
export function captureNode(node: NodeState, newOwner: Owner, garrison: number): void {
  node.owner = newOwner;
  node.troops = garrison;
  node.shieldTicks = 0;
  if (node.kind === 'chest') {
    node.kind = 'normal';
    node.size = 'small';
  } else if (node.kind === 'bandits') {
    node.kind = 'normal';
    node.raidTick = null;
  }
}
