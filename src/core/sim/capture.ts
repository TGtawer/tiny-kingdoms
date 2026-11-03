import { BUILDINGS } from '../../config/balance';
import type { Building, BuildingLevel, NodeState, Side } from './World';

/** Building after its node changes owner: loses a level; level 1 is destroyed. */
export function downgradeOnCapture(building: Building | null): Building | null {
  if (!building) return null;
  const level = building.level - BUILDINGS.captureLevelLoss;
  if (level < 1) return null;
  return { type: building.type, level: level as BuildingLevel };
}

export function captureNode(node: NodeState, newOwner: Side, garrison: number): void {
  node.owner = newOwner;
  node.troops = garrison;
  node.building = downgradeOnCapture(node.building);
}
