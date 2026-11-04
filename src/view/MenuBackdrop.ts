import * as Phaser from 'phaser';
import { TICK_MS, type NodeSize } from '../config/balance';
import { ARMY_FX, COLORS, MAX_FRAME_DELTA_MS, MENU_FX } from '../config/game';
import { aiParamsFromLevel, aiStep, createAi, type AiState } from '../core/ai/EnemyAI';
import { step } from '../core/sim/tick';
import { createWorld, type World } from '../core/sim/World';
import { MENU_BACKGROUND } from '../levels';
import { ArmyView, armyLevelPosition } from './ArmyView';
import { pop, ringBurst } from './effects';
import { clamp, px, type Point, type ScreenLayout } from './layout';
import { NodeView } from './NodeView';
import { RoadView } from './RoadView';

const FX = MENU_FX.battle;

/**
 * The menu level stretched over the whole screen: nodes keep to the screen edges (above and below the
 * menu panel), node sizes follow docs/VISUALS.md V-1 instead of the battle field scale.
 */
class StretchLayout implements ScreenLayout {
  /** Roads stay at their minimum width (RoadView takes the larger of it and scale-based width). */
  readonly scale = 0;
  private readonly sx: number;
  private readonly sy: number;
  private readonly radiusScale: number;

  constructor(width: number, height: number) {
    // Level coordinates are the frame divided by its height: x 0..frameW/frameH, y 0..1.
    this.sx = width / (FX.frameW / FX.frameH);
    this.sy = height;
    const cssW = width / px(1);
    const cssH = height / px(1);
    this.radiusScale = clamp(Math.min(cssW / FX.frameW, cssH / FX.frameH), 1, FX.maxRadiusScale);
  }

  toScreen(x: number, y: number): Point {
    return { x: x * this.sx, y: y * this.sy };
  }

  nodeRadius(size: NodeSize): number {
    return px(FX.nodeRadius[size] * this.radiusScale);
  }

  hitRadius(size: NodeSize): number {
    return this.nodeRadius(size);
  }
}

/**
 * AI-vs-AI battle behind the main menu (docs/VISUALS.md V-1.1): the real simulation, AI and views,
 * no input and no sound. When one side wins (or after FX.maxSec) it waits, fades out and starts over
 * with a new random seed.
 */
export class MenuBackdrop {
  private readonly layer: Phaser.GameObjects.Container;
  private layout: StretchLayout;
  private world!: World;
  private ais: AiState[] = [];
  private roads!: RoadView;
  private readonly nodeViews = new Map<string, NodeView>();
  private readonly armyViews = new Map<string, ArmyView>();
  private readonly prevArmyPos = new Map<string, Point>();
  private accumulator = 0;
  /** Real time since this battle started, ms. */
  private elapsedMs = 0;
  /** When the battle was decided (elapsedMs), or null while it goes on. */
  private decidedAt: number | null = null;
  private fading = false;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
  ) {
    this.layer = scene.add.container(0, 0).setDepth(depth);
    this.layout = new StretchLayout(scene.scale.width, scene.scale.height);
    this.start();
  }

  resize(width: number, height: number): void {
    this.layout = new StretchLayout(width, height);
    this.place();
  }

  update(delta: number): void {
    const dt = Math.min(delta, MAX_FRAME_DELTA_MS);
    this.elapsedMs += dt;
    if (this.decidedAt === null) {
      this.accumulator += dt * FX.simSpeed;
      while (this.accumulator >= TICK_MS && !this.world.winner) {
        this.tick();
        this.accumulator -= TICK_MS;
      }
      if (this.world.winner || this.elapsedMs >= FX.maxSec * 1000) this.decide();
    } else if (!this.fading && this.elapsedMs - this.decidedAt >= FX.restartDelayMs) {
      this.fading = true;
      this.scene.tweens.add({ targets: this.layer, alpha: 0, duration: FX.fadeMs, onComplete: () => this.start() });
    }
    this.render(this.decidedAt === null ? this.accumulator / TICK_MS : 1);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.layer);
    for (const view of this.armyViews.values()) this.scene.tweens.killTweensOf(view);
    this.layer.destroy(true);
    this.nodeViews.clear();
    this.armyViews.clear();
  }

  private start(): void {
    for (const view of this.armyViews.values()) this.scene.tweens.killTweensOf(view);
    for (const view of this.nodeViews.values()) this.scene.tweens.killTweensOf(view);
    this.layer.removeAll(true);
    this.nodeViews.clear();
    this.armyViews.clear();
    this.prevArmyPos.clear();

    // A new seed every time, so the backdrop battle goes differently on each visit.
    this.world = createWorld(MENU_BACKGROUND, { seed: Math.floor(Math.random() * 1e9) });
    const params = aiParamsFromLevel(MENU_BACKGROUND.enemy);
    this.ais = [createAi('player', params), createAi('enemy', params)];

    this.roads = new RoadView(this.scene);
    this.layer.add(this.roads.gameObject);
    for (const node of MENU_BACKGROUND.nodes) {
      const view = new NodeView(this.scene, this.world.nodes[node.id]!, node.capital === true);
      this.nodeViews.set(node.id, view);
      this.layer.add(view);
    }
    this.place();

    this.layer.setAlpha(1);
    this.accumulator = 0;
    this.elapsedMs = 0;
    this.decidedAt = null;
    this.fading = false;
  }

  private place(): void {
    this.roads.draw(this.world, this.layout);
    for (const node of Object.values(this.world.nodes)) this.nodeViews.get(node.id)!.place(node, this.layout);
  }

  private decide(): void {
    this.decidedAt = this.elapsedMs;
    // The simulation stops with the winner: armies still on the road fade instead of freezing mid-way.
    for (const view of this.armyViews.values()) this.scene.tweens.add({ targets: view, alpha: 0, duration: FX.fadeMs });
  }

  private tick(): void {
    this.prevArmyPos.clear();
    for (const army of this.world.armies) this.prevArmyPos.set(army.id, armyLevelPosition(this.world, army));
    const commands = this.ais.flatMap((ai) => aiStep(this.world, ai));
    for (const event of step(this.world, commands)) {
      if (event.type !== 'arrived' || event.outcome !== 'captured') continue;
      const view = this.nodeViews.get(event.nodeId)!;
      const owner = this.world.nodes[event.nodeId]!.owner;
      pop(this.scene, view);
      ringBurst(this.scene, view.x, view.y, view.radius, owner === 'neutral' ? COLORS.faction.neutral : COLORS.faction[owner]);
    }
  }

  private render(alpha: number): void {
    const world = this.world;
    for (const node of Object.values(world.nodes)) this.nodeViews.get(node.id)!.sync(node);

    const alive = new Set<string>();
    const now = this.scene.time.now;
    for (const army of world.armies) {
      alive.add(army.id);
      let view = this.armyViews.get(army.id);
      if (!view) {
        view = new ArmyView(this.scene, army.owner, Number(army.id.slice(1)) * 1.7);
        this.armyViews.set(army.id, view);
        this.layer.add(view);
      }
      view.setCount(army.count);
      const cur = armyLevelPosition(world, army);
      const prev = this.prevArmyPos.get(army.id) ?? cur;
      const p = this.layout.toScreen(prev.x + (cur.x - prev.x) * alpha, prev.y + (cur.y - prev.y) * alpha);
      view.setPosition(p.x, p.y);
      view.setScale(FX.armyScale * (1 + ARMY_FX.bob * Math.sin(now / ARMY_FX.bobPeriodMs + view.phase)));
    }
    for (const [id, view] of this.armyViews) {
      if (alive.has(id)) continue;
      view.destroy();
      this.armyViews.delete(id);
    }
  }
}
