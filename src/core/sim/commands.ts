import { ARMY, BUILDINGS, type BuildingType, type SpellId } from '../../config/balance';
import { armyPath } from './pathfinding';
import { fireballKill, reinforcementTroops, shieldTicks, spellCooldownMs, spellCost } from './spells';
import { isRival, type ArmyState, type BuildingLevel, type Side, type World } from './World';

/**
 * How many troops an order takes (GDD 3.5): `swipe` sends 75% (the only player gesture);
 * `pull` sends 50% and is used only by the AI to move troops up from the rear.
 */
export type SendMode = 'swipe' | 'pull';

export interface SendArmy {
  type: 'send';
  side: Side;
  from: string;
  to: string;
  /** Defaults to 'swipe'. */
  mode?: SendMode;
}

export interface Build {
  type: 'build';
  side: Side;
  nodeId: string;
  building: BuildingType;
}

export interface Upgrade {
  type: 'upgrade';
  side: Side;
  nodeId: string;
}

export interface CastSpell {
  type: 'cast';
  side: Side;
  spell: SpellId;
  nodeId: string;
}

/** Multi-node sends are expressed as several SendArmy commands. */
export type Command = SendArmy | Build | Upgrade | CastSpell;

export type RejectReason =
  | 'gameOver'
  | 'unknownNode'
  | 'notOwner'
  | 'sameNode'
  | 'notEnoughTroops'
  | 'noPath'
  | 'occupied'
  | 'noGoldVein'
  | 'notBuildable'
  | 'noBuilding'
  | 'maxLevel'
  | 'notEnoughGold'
  | 'spellLocked'
  | 'cooldown'
  | 'invalidTarget';

/** Whole troops in a node (what the player sees). The epsilon absorbs float noise from production. */
export function visibleTroops(troops: number): number {
  return Math.floor(troops + 1e-9);
}

/**
 * Troops an order takes from a node: 75% (swipe) or 50% (AI pull) of the visible troops, rounded down,
 * at least minSend; 0 if the node cannot send. At least one troop always stays behind.
 */
export function sendAmount(troops: number, mode: SendMode = 'swipe'): number {
  const visible = visibleTroops(troops);
  if (visible < ARMY.minTroopsToSend) return 0;
  return Math.min(visible - 1, Math.max(ARMY.minSend, Math.floor(visible * ARMY.sendShare[mode])));
}

/** Cost to build (no building yet) or to upgrade to the next level; null if already max level. */
export function buildCost(level: BuildingLevel | 0): number | null {
  if (level >= BUILDINGS.maxLevel) return null;
  return BUILDINGS.cost[level as 0 | 1 | 2];
}

/** Returns why the command is invalid, or null if it can be applied. */
export function validate(world: World, cmd: Command): RejectReason | null {
  if (world.winner) return 'gameOver';
  const side = world.sides[cmd.side];

  switch (cmd.type) {
    case 'send': {
      const from = world.nodes[cmd.from];
      if (!from || !world.nodes[cmd.to]) return 'unknownNode';
      if (from.owner !== cmd.side) return 'notOwner';
      if (cmd.from === cmd.to) return 'sameNode';
      if (sendAmount(from.troops, cmd.mode) === 0) return 'notEnoughTroops';
      if (!armyPath(world, cmd.side, cmd.from, cmd.to)) return 'noPath';
      return null;
    }
    case 'build': {
      const node = world.nodes[cmd.nodeId];
      if (!node) return 'unknownNode';
      if (node.owner !== cmd.side) return 'notOwner';
      if (node.kind === 'temple') return 'notBuildable';
      if (node.building) return 'occupied';
      if (cmd.building === 'mine' && !node.hasGoldVein) return 'noGoldVein';
      if (side.gold < buildCost(0)!) return 'notEnoughGold';
      return null;
    }
    case 'upgrade': {
      const node = world.nodes[cmd.nodeId];
      if (!node) return 'unknownNode';
      if (node.owner !== cmd.side) return 'notOwner';
      if (!node.building) return 'noBuilding';
      const cost = buildCost(node.building.level);
      if (cost === null) return 'maxLevel';
      if (side.gold < cost) return 'notEnoughGold';
      return null;
    }
    case 'cast': {
      const node = world.nodes[cmd.nodeId];
      if (!node) return 'unknownNode';
      if (!side.unlockedSpells.includes(cmd.spell)) return 'spellLocked';
      if (side.spellCooldowns[cmd.spell] > 0) return 'cooldown';
      // Fireball hits a rival's node (not through a shield); reinforcement and shield target an own node.
      // TODO(design): can fireball target neutral nodes? GDD says "enemy node", so not for now.
      const valid = cmd.spell === 'fireball' ? isRival(cmd.side, node.owner) && node.shieldTicks <= 0 : node.owner === cmd.side;
      if (!valid) return 'invalidTarget';
      if (side.gold < spellCost(cmd.spell)) return 'notEnoughGold';
      return null;
    }
  }
}

/** Applies a command that already passed `validate`. Returns the created army for sends. */
export function apply(world: World, cmd: Command): ArmyState | null {
  const side = world.sides[cmd.side];

  switch (cmd.type) {
    case 'send': {
      const from = world.nodes[cmd.from]!;
      const count = sendAmount(from.troops, cmd.mode);
      from.troops -= count;
      const army: ArmyState = {
        id: `a${world.nextArmyId++}`,
        owner: cmd.side,
        count,
        path: armyPath(world, cmd.side, cmd.from, cmd.to)!,
        segment: 0,
        progress: 0,
        targetId: cmd.to,
      };
      world.armies.push(army);
      return army;
    }
    case 'build': {
      side.gold -= buildCost(0)!;
      world.nodes[cmd.nodeId]!.building = { type: cmd.building, level: 1 };
      return null;
    }
    case 'upgrade': {
      const building = world.nodes[cmd.nodeId]!.building!;
      side.gold -= buildCost(building.level)!;
      building.level = (building.level + 1) as BuildingLevel;
      return null;
    }
    case 'cast': {
      const node = world.nodes[cmd.nodeId]!;
      side.gold -= spellCost(cmd.spell);
      side.spellCooldowns[cmd.spell] = spellCooldownMs(cmd.spell, side.modifiers);
      if (cmd.spell === 'fireball') {
        node.troops -= fireballKill(node.troops, side.modifiers);
      } else if (cmd.spell === 'reinforcement') {
        node.troops += reinforcementTroops(side.modifiers);
      } else {
        // Casting again on a shielded node restarts the timer.
        node.shieldTicks = shieldTicks(side.modifiers);
      }
      return null;
    }
  }
}
