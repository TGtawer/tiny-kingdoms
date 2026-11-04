import { SPECIAL_NODES, SPELL_IDS, TICK_MS, type BuildingType, type NodeKind, type NodeSize, type SpellId } from '../../config/balance';
import type { LevelData } from '../level/schema';
import type { Goal } from './victory';
import { createCitadel, type CitadelState } from './specials/citadel';
import { createDragon, type DragonState } from './specials/dragon';
import { nextRandom, seedState } from './rng';

export type Owner = 'player' | 'enemy' | 'enemy2' | 'neutral';
export type Side = Exclude<Owner, 'neutral'>;
/** All sides; 'enemy2' is the optional second enemy (GDD 3.2) and stays inert without nodes. */
export const SIDES: readonly Side[] = ['player', 'enemy', 'enemy2'];
export const ENEMY_SIDES: readonly Side[] = ['enemy', 'enemy2'];

/** Whether `owner` is a hostile side for `side` (another non-neutral side). */
export function isRival(side: Side, owner: Owner): boolean {
  return owner !== 'neutral' && owner !== side;
}
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
  kind: NodeKind;
  /** Portal pair id (portals only). */
  portalPair: string | null;
  /** Bandit camps: tick of the next raid. */
  raidTick: number | null;
  /** Shield spell: ticks left while the node can't be attacked (0 = no shield). */
  shieldTicks: number;
}

export interface ArmyState {
  id: string;
  /** 'neutral' for bandit raids. */
  owner: Owner;
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
  shield: { extraDurationSec: number; cooldownReductionSec: number };
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
  /** Portal links (invisible roads between the two nodes of a pair). */
  portals: Array<[string, string]>;
  armies: ArmyState[];
  sides: Record<Side, SideState>;
  nextArmyId: number;
  rngState: number;
  winner: Side | null;
  goal: Goal;
  /** Hold goal: ticks the player has held the node in a row. */
  goalTicks: number;
  /** Start capitals of the sides (level `capital` flags), for the capital goal. */
  capitals: Record<Side, string | null>;
  /** Boss mechanic of the level, if any. */
  boss: DragonState | CitadelState | null;
}

export function defaultModifiers(): SideModifiers {
  return {
    troopProductionMult: 1,
    goldIncomeMult: 1,
    unitStrengthMult: 1,
    spells: {
      fireball: { killShareBonus: 0, cooldownReductionSec: 0 },
      reinforcement: { extraTroops: 0, cooldownReductionSec: 0 },
      shield: { extraDurationSec: 0, cooldownReductionSec: 0 },
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
      kind: n.kind ?? 'normal',
      portalPair: n.portalPair ?? null,
      raidTick: n.kind === 'bandits' ? Math.round(SPECIAL_NODES.bandits.raidEveryMs / TICK_MS) : null,
      shieldTicks: 0,
    };
  }
  const pairs = new Map<string, string[]>();
  for (const n of level.nodes) if (n.portalPair) pairs.set(n.portalPair, [...(pairs.get(n.portalPair) ?? []), n.id]);
  const portals = [...pairs.values()].filter((ids) => ids.length === 2).map(([a, b]) => [a!, b!] as [string, string]);

  const enemySide = (params: LevelData['enemy'] | undefined): SideState => {
    const modifiers = defaultModifiers();
    modifiers.troopProductionMult = params?.productionMult ?? 1;
    // TODO(design): GDD does not say whether the enemy AI uses spells; it has none for now.
    return { gold: params?.startGold ?? 0, unlockedSpells: [], spellCooldowns: zeroCooldowns(), modifiers };
  };

  return {
    tick: 0,
    nodes,
    roads: level.roads.map(([a, b]) => [a, b]),
    portals,
    armies: [],
    sides: {
      player: {
        gold: level.playerStartGold,
        unlockedSpells: [...(player.unlockedSpells ?? [])],
        spellCooldowns: zeroCooldowns(),
        modifiers: structuredClone(player.modifiers ?? defaultModifiers()),
      },
      enemy: enemySide(level.enemy),
      enemy2: enemySide(level.enemy2),
    },
    nextArmyId: 1,
    rngState: seedState(options.seed ?? 1),
    winner: null,
    goal: level.goal ? structuredClone(level.goal) : { type: 'conquer' },
    goalTicks: 0,
    capitals: {
      player: level.nodes.find((n) => n.capital && n.owner === 'player')?.id ?? null,
      enemy: level.nodes.find((n) => n.capital && n.owner === 'enemy')?.id ?? null,
      enemy2: level.nodes.find((n) => n.capital && n.owner === 'enemy2')?.id ?? null,
    },
    boss:
      level.special?.type === 'dragon'
        ? createDragon()
        : level.special?.type === 'citadel'
          ? createCitadel(String(level.special.params.nodeId))
          : null,
  };
}


export function nodesOf(world: World, owner: Owner): NodeState[] {
  return Object.values(world.nodes).filter((n) => n.owner === owner);
}

/** Unit strength of an owner in combat (neutrals and bandits: 1). */
export function strengthOf(world: World, owner: Owner): number {
  return owner === 'neutral' ? 1 : world.sides[owner].modifiers.unitStrengthMult;
}

/** How much one defender of `node` is worth: unit strength times the fortress bonus. */
export function defenseStrength(world: World, node: NodeState): number {
  return strengthOf(world, node.owner) * (node.kind === 'fortress' ? SPECIAL_NODES.fortress.defenseMult : 1);
}

/** Share of all nodes (neutrals included) owned by `owner`, 0..1. */
export function ownedShare(world: World, owner: Owner): number {
  const all = Object.values(world.nodes);
  return all.length === 0 ? 0 : all.filter((n) => n.owner === owner).length / all.length;
}

/** Random number in [0, 1) from the world's seeded RNG. */
export function random(world: World): number {
  const [value, next] = nextRandom(world.rngState);
  world.rngState = next;
  return value;
}
