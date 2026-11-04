import * as Phaser from 'phaser';
import { ARMY_RADIUS_PX, COLORS, SQUAD_LIP } from '../config/game';
import { visibleTroops } from '../core/sim/commands';
import type { ArmyState, Owner, World } from '../core/sim/World';
import { px, textStyle, type Point } from './layout';

/** Army position in level coordinates (along its current road segment). */
export function armyLevelPosition(world: World, army: ArmyState): Point {
  const a = world.nodes[army.path[army.segment]!]!;
  const b = world.nodes[army.path[Math.min(army.segment + 1, army.path.length - 1)]!]!;
  return { x: a.x + (b.x - a.x) * army.progress, y: a.y + (b.y - a.y) * army.progress };
}

/** One squad marker with a number; armies are never drawn as individual units. */
export class ArmyView extends Phaser.GameObjects.Container {
  private readonly countText: Phaser.GameObjects.Text;
  private drawnCount = -1;
  /** Phase offset of the marching bob, so armies don't pulse in sync. */
  readonly phase: number;

  constructor(scene: Phaser.Scene, owner: Owner, phase = 0) {
    super(scene, 0, 0);
    this.phase = phase;
    const g = scene.add.graphics();
    drawSquad(g, px(ARMY_RADIUS_PX), owner, px(1));

    this.countText = scene.add.text(0, 0, '', textStyle(14)).setOrigin(0.5).setStroke('#1f2937', px(3));
    this.add([g, this.countText]);
    scene.add.existing(this);
  }

  /** The number currently shown on the marker. */
  get shownCount(): number {
    return Math.max(0, this.drawnCount);
  }

  setCount(count: number): void {
    const visible = visibleTroops(count);
    if (visible === this.drawnCount) return;
    this.drawnCount = visible;
    this.countText.setText(String(visible));
  }
}

/**
 * Squad marker body without the number, centered at (0, 0): ground shadow, colored disc, outline, banner.
 * `unit` scales the line widths (px(1) on screen, 1 when baking at CSS scale).
 */
export function drawSquad(g: Phaser.GameObjects.Graphics, r: number, owner: Owner, unit: number, shadow = true): void {
  if (shadow) g.fillStyle(0x000000, 0.2).fillEllipse(0, r * 0.9, r * 2, r * 0.6);
  // Rim exactly under the outline, the face a bit higher inside it (as on the nodes).
  g.fillStyle(COLORS.factionDark[owner], 1).fillCircle(0, 0, r);
  g.fillStyle(COLORS.faction[owner], 1).fillCircle(0, -r * SQUAD_LIP, r * (1 - SQUAD_LIP));
  g.lineStyle(2.5 * unit, COLORS.outline, 1).strokeCircle(0, 0, r);
  // Little banner pole to read as "marching squad".
  g.lineStyle(2 * unit, COLORS.outline, 1).lineBetween(r * 0.6, -r * 0.6, r * 0.6, -r * 1.7);
  g.fillStyle(COLORS.faction[owner], 1).fillTriangle(r * 0.6, -r * 1.7, r * 1.4, -r * 1.45, r * 0.6, -r * 1.2);
  g.lineStyle(1.5 * unit, COLORS.outline, 1).strokeTriangle(r * 0.6, -r * 1.7, r * 1.4, -r * 1.45, r * 0.6, -r * 1.2);
}
