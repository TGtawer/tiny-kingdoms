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
 * fortresses, temples and portals keep their kind.
 */
export function captureNode(node: NodeState, newOwner: Owner, garrison: number): void {
  node.owner = newOwner;
  node.troops = garrison;
  node.building = downgradeOnCapture(node.building);
  if (node.kind === 'chest') {
    node.kind = 'normal';
    node.size = 'small';
  } else if (node.kind === 'bandits') {
    node.kind = 'normal';
    node.raidTick = null;
  }
}
