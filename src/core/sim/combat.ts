import { BUILDINGS, SPECIAL_NODES } from '../../config/balance';
import { captureNode } from './capture';
import { defenseStrength, strengthOf, type ArmyState, type NodeState, type World } from './World';

/** Below this, a remainder counts as zero (guards against float noise). */
const EPSILON = 1e-9;

export type ArrivalOutcome = 'reinforced' | 'destroyedByTower' | 'repelled' | 'captured' | 'shielded';

export interface ArrivalResult {
  armyId: string;
  nodeId: string;
  outcome: ArrivalOutcome;
  towerDamage: number;
  /** Gold the capturer got from a chest (0 otherwise). */
  chestGold: number;
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
  const base = { armyId: army.id, nodeId: node.id, chestGold: 0 };

  if (node.owner === army.owner) {
    // Reinforcing may exceed capacity; production just stops.
    node.troops += army.count;
    return { ...base, outcome: 'reinforced', towerDamage: 0 };
  }

  // A shielded node takes no harm: the hostile army breaks on the shield.
  if (node.shieldTicks > 0) return { ...base, outcome: 'shielded', towerDamage: 0 };

  const damage = Math.min(army.count, towerDamage(node));
  const attackers = army.count - damage;
  if (attackers <= EPSILON) {
    return { ...base, outcome: 'destroyedByTower', towerDamage: damage };
  }

  const attackerStrength = strengthOf(world, army.owner);
  const { attackersLeft, defendersLeft } = resolveBattle(attackers, attackerStrength, node.troops, defenseStrength(world, node));

  if (attackersLeft > 0) {
    const chest = node.kind === 'chest' && army.owner !== 'neutral' ? SPECIAL_NODES.chest.gold : 0;
    captureNode(node, army.owner, attackersLeft);
    if (chest > 0 && army.owner !== 'neutral') world.sides[army.owner].gold += chest;
    return { ...base, outcome: 'captured', towerDamage: damage, chestGold: chest };
  }
  node.troops = defendersLeft;
  return { ...base, outcome: 'repelled', towerDamage: damage };
}
