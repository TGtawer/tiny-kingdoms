import { BUILDINGS } from '../../config/balance';
import type { Building, BuildingLevel, NodeState, Owner } from './World';

/** Building after its node changes owner: loses a level; level 1 is destroyed. */
export function downgradeOnCapture(building: Building | null): Building | null {
  if (!building) return null;
  const level = building.level - BUILDINGS.captureLevelLoss;
  if (level < 1) return null;
  return { type: building.type, level: level as BuildingLevel };
}

/**
 * Changes the owner. Chests and bandit camps turn into normal nodes (a chest also becomes small);
 * fortresses, temples and portals keep their kind. The old owner's stream from the node breaks off: its units
 * that hadn't left died with the garrison (GDD 3.6); the stream itself is dropped at the next release step.
 */
export function captureNode(node: NodeState, newOwner: Owner, garrison: number): void {
  node.owner = newOwner;
  node.troops = garrison;
  node.shieldTicks = 0;
  node.streamId = null;
  node.building = downgradeOnCapture(node.building);
  if (node.kind === 'chest') {
    node.kind = 'normal';
    node.size = 'small';
  } else if (node.kind === 'bandits') {
    node.kind = 'normal';
    node.raidTick = null;
  }
}
