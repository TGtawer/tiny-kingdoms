import type { BuildingType, NodeSize } from '../../config/balance';

// TODO(stage-4): runtime validation of LevelData (ids unique, roads reference existing nodes, coords in 0..1).

export type LevelOwner = 'player' | 'enemy' | 'neutral';

export interface LevelNode {
  id: string;
  /** Normalized level coordinates, 0..1. */
  x: number;
  y: number;
  size: NodeSize;
  owner: LevelOwner;
  troops: number;
  hasGoldVein: boolean;
  building: { type: BuildingType; level: 1 | 2 | 3 } | null;
}

export interface EnemyParams {
  productionMult: number;
  aiThinkMs: number;
  aggression: number;
  startGold: number;
}

export interface LevelData {
  /** e.g. "c01_l01" */
  id: string;
  chapter: number;
  index: number;
  nodes: LevelNode[];
  roads: Array<[string, string]>;
  enemy: EnemyParams;
  playerStartGold: number;
  /** Special mechanic for 10th levels. TODO(design): mechanics are not defined yet. */
  special?: { type: string; params: Record<string, unknown> };
  /** Tutorial scenario id. */
  tutorial?: string;
}
