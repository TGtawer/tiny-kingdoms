import { BUILDINGS } from '../../config/balance';
import { captureNode } from './capture';
import type { ArmyState, NodeState, World } from './World';

/** Below this, a remainder counts as zero (guards against float noise). */
const EPSILON = 1e-9;

export type ArrivalOutcome = 'reinforced' | 'destroyedByTower' | 'repelled' | 'captured';

export interface ArrivalResult {
  armyId: string;
  nodeId: string;
  outcome: ArrivalOutcome;
  towerDamage: number;
}

export function towerDamage(node: NodeState): number {
  if (node.building?.type !== 'tower') return 0;
  return BUILDINGS.tower.damage[node.building.level - 1]!;
}

/**
 * Mutual 1:1 destruction scaled by unit strength.
 * Attackers win only if some of them survive; a tie leaves the defenders at zero.
 */
export function resolveBattle(
  attackers: number,
  attackerStrength: number,
  defenders: number,
  defenderStrength: number,
): { attackersLeft: number; defendersLeft: number } {
  const attackPower = attackers * attackerStrength;
  const defensePower = defenders * defenderStrength;
  if (attackPower - defensePower > EPSILON) {
    return { attackersLeft: (attackPower - defensePower) / attackerStrength, defendersLeft: 0 };
  }
  return { attackersLeft: 0, defendersLeft: Math.max(0, (defensePower - attackPower) / defenderStrength) };
}

/** Applies an army arriving at its target node. Uses the node's owner at the moment of arrival. */
export function arrive(world: World, army: ArmyState): ArrivalResult {
  const node = world.nodes[army.targetId]!;
  const base = { armyId: army.id, nodeId: node.id };

  if (node.owner === army.owner) {
    // Reinforcing may exceed capacity; production just stops.
    node.troops += army.count;
    return { ...base, outcome: 'reinforced', towerDamage: 0 };
  }

  const damage = Math.min(army.count, towerDamage(node));
  const attackers = army.count - damage;
  if (attackers <= EPSILON) {
    return { ...base, outcome: 'destroyedByTower', towerDamage: damage };
  }

  const attackerStrength = world.sides[army.owner].modifiers.unitStrengthMult;
  const defenderStrength = node.owner === 'neutral' ? 1 : world.sides[node.owner].modifiers.unitStrengthMult;
  const { attackersLeft, defendersLeft } = resolveBattle(attackers, attackerStrength, node.troops, defenderStrength);

  if (attackersLeft > 0) {
    captureNode(node, army.owner, attackersLeft);
    return { ...base, outcome: 'captured', towerDamage: damage };
  }
  node.troops = defendersLeft;
  return { ...base, outcome: 'repelled', towerDamage: damage };
}
