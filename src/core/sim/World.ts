import { SPELL_IDS, type BuildingType, type NodeSize, type SpellId } from '../../config/balance';
import type { LevelData } from '../level/schema';
import { nextRandom, seedState } from './rng';

export type Owner = 'player' | 'enemy' | 'neutral';
export type Side = Exclude<Owner, 'neutral'>;
export type BuildingLevel = 1 | 2 | 3;

export interface Building {
  type: BuildingType;
  level: BuildingLevel;
}

export interface NodeState {
  id: string;
  /** Normalized level coordinates, 0..1. */
  x: number;
  y: number;
  size: NodeSize;
  owner: Owner;
  /** Fractional internally; UI shows floor. */
  troops: number;
  hasGoldVein: boolean;
  building: Building | null;
}

export interface ArmyState {
  id: string;
  owner: Side;
  count: number;
  /** Node ids from source to target. */
  path: string[];
  /** Index of the current segment: path[segment] -> path[segment + 1]. */
  segment: number;
  /** 0..1 along the current segment. */
  progress: number;
  targetId: string;
}

export interface SpellModifiers {
  fireball: { killShareBonus: number; cooldownReductionSec: number };
  reinforcement: { extraTroops: number; cooldownReductionSec: number };
}

/** Bonuses from meta progression (player) or level params (enemy). */
export interface SideModifiers {
  troopProductionMult: number;
  goldIncomeMult: number;
  /** Multiplier applied to this side's units in combat. */
  unitStrengthMult: number;
  spells: SpellModifiers;
}

export interface SideState {
  gold: number;
  unlockedSpells: SpellId[];
  /** Remaining cooldown in ms (integers, so ticks count down exactly). */
  spellCooldowns: Record<SpellId, number>;
  modifiers: SideModifiers;
}

export interface World {
  tick: number;
  nodes: Record<string, NodeState>;
  roads: Array<[string, string]>;
  armies: ArmyState[];
  sides: Record<Side, SideState>;
  nextArmyId: number;
  rngState: number;
  winner: Side | null;
}

export function defaultModifiers(): SideModifiers {
  return {
    troopProductionMult: 1,
    goldIncomeMult: 1,
    unitStrengthMult: 1,
    spells: {
      fireball: { killShareBonus: 0, cooldownReductionSec: 0 },
      reinforcement: { extraTroops: 0, cooldownReductionSec: 0 },
    },
  };
}

export interface PlayerSetup {
  modifiers?: SideModifiers;
  /** Extra troops added to every starting player node. */
  startArmyBonus?: number;
  unlockedSpells?: SpellId[];
}

export interface WorldOptions {
  seed?: number;
  player?: PlayerSetup;
}

function zeroCooldowns(): Record<SpellId, number> {
  return Object.fromEntries(SPELL_IDS.map((id) => [id, 0])) as Record<SpellId, number>;
}

export function createWorld(level: LevelData, options: WorldOptions = {}): World {
  const player = options.player ?? {};
  const startArmyBonus = player.startArmyBonus ?? 0;

  const nodes: Record<string, NodeState> = {};
  for (const n of level.nodes) {
    nodes[n.id] = {
      id: n.id,
      x: n.x,
      y: n.y,
      size: n.size,
      owner: n.owner,
      troops: n.troops + (n.owner === 'player' ? startArmyBonus : 0),
      hasGoldVein: n.hasGoldVein,
      building: n.building ? { ...n.building } : null,
    };
  }

  const enemyModifiers = defaultModifiers();
  enemyModifiers.troopProductionMult = level.enemy.productionMult;

  return {
    tick: 0,
    nodes,
    roads: level.roads.map(([a, b]) => [a, b]),
    armies: [],
    sides: {
      player: {
        gold: level.playerStartGold,
        unlockedSpells: [...(player.unlockedSpells ?? [])],
        spellCooldowns: zeroCooldowns(),
        modifiers: structuredClone(player.modifiers ?? defaultModifiers()),
      },
      enemy: {
        gold: level.enemy.startGold,
        // TODO(design): GDD does not say whether the enemy AI uses spells; it has none for now.
        unlockedSpells: [],
        spellCooldowns: zeroCooldowns(),
        modifiers: enemyModifiers,
      },
    },
    nextArmyId: 1,
    rngState: seedState(options.seed ?? 1),
    winner: null,
  };
}

export function opponentOf(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}

export function nodesOf(world: World, owner: Owner): NodeState[] {
  return Object.values(world.nodes).filter((n) => n.owner === owner);
}

/** Random number in [0, 1) from the world's seeded RNG. */
export function random(world: World): number {
  const [value, next] = nextRandom(world.rngState);
  world.rngState = next;
  return value;
}
