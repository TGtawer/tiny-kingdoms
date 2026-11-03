import * as Phaser from 'phaser';
import { SPELL_IDS, SPELL_UNLOCK_AFTER_CHAPTER, TICK_MS, type SpellId } from '../config/balance';
import { COLORS, DRAG_THRESHOLD_PX, HUD, MAX_FRAME_DELTA_MS } from '../config/game';
import { aiParamsFromLevel, aiStep, createAi, type AiState } from '../core/ai/EnemyAI';
import type { LevelData } from '../core/level/schema';
import type { Command, SendMode } from '../core/sim/commands';
import { armyPath } from '../core/sim/pathfinding';
import { step, type TickEvent } from '../core/sim/tick';
import { advanceTutorial, currentStep, startTutorial, type TutorialState, type UiEvent } from '../core/tutorial/tutorial';
import { createWorld, type NodeState, type World } from '../core/sim/World';
import { t } from '../i18n/i18n';
import { FIRST_LEVEL, getLevel, nextLevel, TUTORIALS } from '../levels';
import type { Platform } from '../platform/Platform';
import { TutorialView } from '../view/TutorialView';
import { ArmyView, armyLevelPosition } from '../view/ArmyView';
import { BuildMenu, type BuildChoice } from '../view/BuildMenu';
import { explosion, floatText, pop, ringBurst } from '../view/effects';
import { FieldLayout, fieldArea, px, type Point } from '../view/layout';
import { NodeView, type Highlight } from '../view/NodeView';
import { RoadView } from '../view/RoadView';
import { BattleHUD } from './BattleHUD';
import { getPlatform } from './registry';

/** Spells open after completing a chapter (GDD 3.8). TODO(stage-5): take from Progress. */
function unlockedSpellsFor(level: LevelData): SpellId[] {
  return SPELL_IDS.filter((s) => level.chapter > SPELL_UNLOCK_AFTER_CHAPTER[s]);
}

/** Delay before the result panel, so the final capture is visible. */
const RESULT_DELAY_MS = 700;

interface DragState {
  pointerId: number;
  sources: string[];
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  downNode: string;
}

export interface BattleSceneData {
  levelId?: string;
}

/** Renders the World and turns input into commands. All rules live in src/core. */
export class BattleScene extends Phaser.Scene {
  private platform!: Platform;
  private level!: LevelData;
  private world!: World;
  private ai!: AiState;
  private layoutField!: FieldLayout;

  private background!: Phaser.GameObjects.Graphics;
  private roads!: RoadView;
  private dragLines!: Phaser.GameObjects.Graphics;
  private hud!: BattleHUD;
  private nodeViews = new Map<string, NodeView>();
  private armyViews = new Map<string, ArmyView>();
  /** Army positions (level coords) at the previous tick, for interpolation. */
  private prevArmyPos = new Map<string, Point>();

  private queue: Command[] = [];
  private accumulator = 0;
  private paused = false;
  private ended = false;
  private selected: string | null = null;
  private menu: BuildMenu | null = null;
  private drag: DragState | null = null;
  private armed: SpellId | null = null;
  private tutorial: TutorialState | null = null;
  private tutorialView: TutorialView | null = null;
  private uiEvents: UiEvent[] = [];

  constructor() {
    super('BattleScene');
  }

  init(data: BattleSceneData): void {
    this.level = (data.levelId && getLevel(data.levelId)) || FIRST_LEVEL;
  }

  create(): void {
    // The scene instance is reused on restart: reset all state.
    this.nodeViews = new Map();
    this.armyViews = new Map();
    this.prevArmyPos = new Map();
    this.queue = [];
    this.accumulator = 0;
    this.paused = false;
    this.ended = false;
    this.selected = null;
    this.menu = null;
    this.drag = null;
    this.armed = null;
    this.uiEvents = [];

    this.platform = getPlatform(this);
    // Seed per level: the AI's timing jitter is reproducible for a given level.
    this.world = createWorld(this.level, {
      seed: this.level.chapter * 100 + this.level.index,
      player: { unlockedSpells: unlockedSpellsFor(this.level) },
    });
    this.ai = createAi('enemy', aiParamsFromLevel(this.level.enemy));
    const script = this.level.tutorial ? TUTORIALS[this.level.tutorial] : undefined;
    this.tutorial = script ? startTutorial(script, this.world.tick) : null;

    this.background = this.add.graphics();
    this.roads = new RoadView(this);
    for (const node of Object.values(this.world.nodes)) {
      this.nodeViews.set(node.id, new NodeView(this, node));
    }
    this.dragLines = this.add.graphics().setDepth(50);
    this.hud = new BattleHUD(this, t('level.title', { index: this.level.index }), this.world.sides.player.unlockedSpells, {
      onPause: () => this.pause(),
      onSpell: (spell) => this.toggleSpell(spell),
    });
    this.tutorialView = this.tutorial ? new TutorialView(this) : null;

    this.relayout();
    if (this.tutorial) this.tutorialView!.show(currentStep(this.tutorial), this.hud.hasSpellBar ? HUD.bottomBar : 0);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.relayout, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout, this);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden, this);
      this.hud.destroy();
      this.tutorialView?.destroy();
      this.tutorialView = null;
    });

    this.platform.gameplayStart();
  }

  override update(time: number, delta: number): void {
    if (!this.paused && !this.ended) {
      this.accumulator += Math.min(delta, MAX_FRAME_DELTA_MS);
      while (this.accumulator >= TICK_MS && !this.ended) {
        this.tickOnce();
        this.accumulator -= TICK_MS;
      }
    }
    this.render(this.ended ? 1 : this.accumulator / TICK_MS);
    this.tutorialView?.update(time, {
      node: (id) => this.nodeViews.get(id) ?? null,
      gold: () => this.hud.goldAnchor(),
    });
  }

  // ---- Simulation -------------------------------------------------------------------------------

  private tickOnce(): void {
    this.prevArmyPos.clear();
    for (const army of this.world.armies) this.prevArmyPos.set(army.id, armyLevelPosition(this.world, army));

    // Player input and the enemy AI go through the same command queue and rules.
    const commands = [...this.queue, ...aiStep(this.world, this.ai)];
    this.queue = [];
    const events = step(this.world, commands);
    for (const event of events) this.handleEvent(event);

    if (this.tutorial && !this.ended && advanceTutorial(this.tutorial, this.world, events, this.uiEvents)) {
      this.tutorialView?.show(currentStep(this.tutorial));
    }
    this.uiEvents = [];
  }

  private handleEvent(event: TickEvent): void {
    switch (event.type) {
      case 'applied': {
        const cmd = event.command;
        if (cmd.type === 'send' && event.armyId) {
          // A new army starts its interpolation at the source node.
          const from = this.world.nodes[cmd.from]!;
          this.prevArmyPos.set(event.armyId, { x: from.x, y: from.y });
        } else if (cmd.type === 'build' || cmd.type === 'upgrade') {
          const view = this.nodeViews.get(cmd.nodeId)!;
          pop(this, view);
          ringBurst(this, view.x, view.y, view.radius, COLORS.gold);
        } else if (cmd.type === 'cast') {
          const view = this.nodeViews.get(cmd.nodeId)!;
          if (cmd.spell === 'fireball') {
            explosion(this, view.x, view.y, view.radius * 1.3);
          } else {
            ringBurst(this, view.x, view.y, view.radius, COLORS.reinforcement);
            pop(this, view);
          }
        }
        break;
      }
      case 'arrived': {
        const view = this.nodeViews.get(event.nodeId)!;
        if (event.towerDamage > 0) floatText(this, view.x, view.y - view.radius, `-${event.towerDamage}`, COLORS.fireball);
        if (event.outcome === 'captured') {
          const owner = this.world.nodes[event.nodeId]!.owner;
          pop(this, view);
          ringBurst(this, view.x, view.y, view.radius, owner === 'neutral' ? COLORS.faction.neutral : COLORS.faction[owner]);
          if (this.selected === event.nodeId) this.deselect();
        } else if (event.outcome === 'repelled' || event.outcome === 'destroyedByTower') {
          ringBurst(this, view.x, view.y, view.radius * 0.9, COLORS.select);
        }
        break;
      }
      case 'clash': {
        // Head-on fight on a road: flash in the winner's color (grey if both died) and show the losses.
        const p = this.layoutField.toScreen(event.x, event.y);
        const survivor = event.survivorId ? this.world.armies.find((a) => a.id === event.survivorId) : undefined;
        const lost = Math.min(...event.armies.map((id) => this.armyViews.get(id)?.shownCount ?? 0));
        ringBurst(this, p.x, p.y, px(18), survivor ? COLORS.faction[survivor.owner] : COLORS.faction.neutral);
        if (lost > 0) floatText(this, p.x, p.y - px(18), `-${lost}`, COLORS.select);
        break;
      }
      case 'gameOver':
        this.endBattle(event.winner);
        break;
      case 'rejected': {
        // Feedback for a player send without a route (e.g. a neutral node in the way).
        const cmd = event.command;
        if (cmd.type === 'send' && cmd.side === 'player' && event.reason === 'noPath') {
          const view = this.nodeViews.get(cmd.to);
          if (view) ringBurst(this, view.x, view.y, view.radius, COLORS.faction.enemy);
        }
        break;
      }
    }
  }

  private endBattle(winner: 'player' | 'enemy'): void {
    this.ended = true;
    this.deselect();
    this.drag = null;
    this.armed = null;
    this.platform.gameplayStop();
    this.tutorialView?.show(null);
    this.time.delayedCall(RESULT_DELAY_MS, () => this.showResult(winner));
  }

  private showResult(winner: 'player' | 'enemy'): void {
    // TODO(stage-5): rewards and the chapter map instead of going straight to the next level.
    const replay = { label: t('result.playAgain'), onClick: () => this.scene.restart({ levelId: this.level.id }) };
    if (winner === 'enemy') {
      this.hud.showResult(t('result.defeat'), false, [replay]);
      return;
    }
    const next = nextLevel(this.level.id);
    if (next) {
      this.hud.showResult(t('result.victory'), true, [
        { label: t('result.next'), onClick: () => this.scene.restart({ levelId: next.id }) },
        replay,
      ]);
    } else {
      this.hud.showResult(t('result.chapterDone'), true, [
        { label: t('result.fromStart'), onClick: () => this.scene.restart({ levelId: FIRST_LEVEL.id }) },
        replay,
      ]);
    }
  }

  // ---- Rendering --------------------------------------------------------------------------------

  private relayout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    this.deselect();

    const nodes = Object.values(this.world.nodes);
    // The bottom stays reserved for the whole level, so the field does not jump when the tutorial ends.
    const bottom = (this.hud.hasSpellBar ? HUD.bottomBar : 0) + (this.tutorial ? HUD.hintBar : 0);
    this.layoutField = new FieldLayout(nodes, fieldArea(w, h, bottom));
    this.drawBackground(w, h);
    this.roads.draw(this.world, this.layoutField);
    for (const node of nodes) this.nodeViews.get(node.id)!.place(node, this.layoutField);
    this.hud.layout();
    this.tutorialView?.layout();
  }

  private drawBackground(w: number, h: number): void {
    const g = this.background;
    g.clear();
    g.fillStyle(COLORS.background, 1).fillRect(0, 0, w, h);
    // Deterministic grass tufts, so the meadow does not look flat.
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const count = Math.round((w * h) / (px(70) * px(70)));
    g.lineStyle(px(2), COLORS.backgroundDark, 0.8);
    for (let i = 0; i < count; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const s = px(4 + rnd() * 3);
      g.lineBetween(x - s, y, x - s * 0.4, y - s * 1.2);
      g.lineBetween(x, y, x, y - s * 1.5);
      g.lineBetween(x + s, y, x + s * 0.4, y - s * 1.2);
    }
  }

  private render(alpha: number): void {
    const world = this.world;

    for (const node of Object.values(world.nodes)) {
      const view = this.nodeViews.get(node.id)!;
      view.sync(node);
      view.setHighlight(this.highlightFor(node));
    }

    // Armies: create/remove views, interpolate between ticks.
    const alive = new Set<string>();
    for (const army of world.armies) {
      alive.add(army.id);
      let view = this.armyViews.get(army.id);
      if (!view) {
        view = new ArmyView(this, army.owner).setDepth(40);
        this.armyViews.set(army.id, view);
      }
      view.setCount(army.count);
      const cur = armyLevelPosition(world, army);
      const prev = this.prevArmyPos.get(army.id) ?? cur;
      const p = this.layoutField.toScreen(prev.x + (cur.x - prev.x) * alpha, prev.y + (cur.y - prev.y) * alpha);
      view.setPosition(p.x, p.y);
    }
    for (const [id, view] of this.armyViews) {
      if (!alive.has(id)) {
        view.destroy();
        this.armyViews.delete(id);
      }
    }

    this.drawDragLines();
    this.hud.update(world, 'player', this.armed);
    if (this.menu) {
      if (world.nodes[this.menu.nodeId]!.owner !== 'player') this.deselect();
      else this.menu.refresh(world.sides.player.gold);
    }
  }

  private highlightFor(node: NodeState): Highlight {
    if (this.armed) {
      const valid = this.armed === 'fireball' ? node.owner === 'enemy' : node.owner === 'player';
      return valid ? this.armed : 'none';
    }
    if (this.drag?.moved) {
      if (this.drag.sources.includes(node.id)) return 'selected';
      const hover = this.nodeAt(this.drag.x, this.drag.y);
      return hover?.id === node.id && this.drag.sources.some((s) => this.canReach(s, node.id)) ? 'target' : 'none';
    }
    if (this.selected === node.id) return 'selected';
    return this.tutorialView?.highlightedNodes().includes(node.id) ? 'hint' : 'none';
  }

  private drawDragLines(): void {
    const g = this.dragLines;
    g.clear();
    const drag = this.drag;
    if (!drag?.moved) return;
    const hover = this.nodeAt(drag.x, drag.y);
    const end = hover ? this.nodeViews.get(hover.id)! : { x: drag.x, y: drag.y };
    for (const id of drag.sources) {
      if (id === hover?.id) continue;
      const from = this.nodeViews.get(id)!;
      // Red line: no route through own nodes to the hovered target.
      const color = hover && !this.canReach(id, hover.id) ? COLORS.faction.enemy : COLORS.select;
      g.lineStyle(px(9), COLORS.outline, 0.35).lineBetween(from.x, from.y, end.x, end.y);
      g.lineStyle(px(5), color, 0.9).lineBetween(from.x, from.y, end.x, end.y);
    }
    g.fillStyle(COLORS.select, 0.9).fillCircle(end.x, end.y, px(7));
  }

  /** Whether a player army from `from` has a route to `to` (only through own nodes). */
  private canReach(from: string, to: string): boolean {
    return from !== to && armyPath(this.world, 'player', from, to) !== null;
  }

  // ---- Input ------------------------------------------------------------------------------------

  /** Nearest node whose hit circle contains the point. */
  private nodeAt(x: number, y: number): NodeState | null {
    let best: NodeState | null = null;
    let bestDist = Infinity;
    for (const view of this.nodeViews.values()) {
      const d = Math.hypot(view.x - x, view.y - y);
      if (d <= view.hitRadius && d < bestDist) {
        bestDist = d;
        best = this.world.nodes[view.nodeId]!;
      }
    }
    return best;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (over.length > 0 || this.paused || this.ended || this.drag) return;
    const node = this.nodeAt(pointer.x, pointer.y);

    if (this.armed) {
      if (node && this.highlightFor(node) !== 'none') {
        this.queue.push({ type: 'cast', side: 'player', spell: this.armed, nodeId: node.id });
      }
      this.armed = null;
      return;
    }

    if (node?.owner === 'player') {
      this.drag = {
        pointerId: pointer.id,
        sources: [node.id],
        startX: pointer.x,
        startY: pointer.y,
        x: pointer.x,
        y: pointer.y,
        moved: false,
        downNode: node.id,
      };
      return;
    }

    // Tap-tap: a node is selected, the second tap on a foreign node sends the army.
    if (node && this.selected) this.sendFrom([this.selected], node.id, 'tap');
    this.deselect();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || pointer.id !== drag.pointerId) return;
    drag.x = pointer.x;
    drag.y = pointer.y;
    if (!drag.moved && Math.hypot(pointer.x - drag.startX, pointer.y - drag.startY) > px(DRAG_THRESHOLD_PX)) {
      drag.moved = true;
      this.deselect();
    }
    if (drag.moved) {
      // Sliding over more own nodes adds them as sources (multi-select).
      const node = this.nodeAt(pointer.x, pointer.y);
      if (node?.owner === 'player' && !drag.sources.includes(node.id)) drag.sources.push(node.id);
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || pointer.id !== drag.pointerId) return;
    this.drag = null;
    if (this.paused || this.ended) return;

    if (drag.moved) {
      const target = this.nodeAt(pointer.x, pointer.y);
      if (target) this.sendFrom(drag.sources, target.id, 'swipe');
      return;
    }

    // A tap on an own node.
    if (this.selected && this.selected !== drag.downNode) {
      this.sendFrom([this.selected], drag.downNode, 'tap');
      this.deselect();
    } else if (this.selected === drag.downNode) {
      this.deselect();
    } else {
      this.select(drag.downNode);
    }
  }

  private sendFrom(sources: readonly string[], target: string, mode: SendMode): void {
    for (const from of sources) {
      if (from !== target) this.queue.push({ type: 'send', side: 'player', from, to: target, mode });
    }
  }

  private select(nodeId: string): void {
    this.deselect();
    this.selected = nodeId;
    this.uiEvents.push({ type: 'select', node: nodeId });
    const view = this.nodeViews.get(nodeId)!;
    this.menu = new BuildMenu(
      this,
      this.world.nodes[nodeId]!,
      { x: view.x, y: view.y, radius: view.radius },
      (choice) => this.onBuild(nodeId, choice),
    ).setDepth(90);
    this.menu.refresh(this.world.sides.player.gold);
  }

  private deselect(): void {
    this.selected = null;
    this.menu?.destroy();
    this.menu = null;
  }

  private onBuild(nodeId: string, choice: BuildChoice): void {
    this.queue.push(
      choice.kind === 'build'
        ? { type: 'build', side: 'player', nodeId, building: choice.building }
        : { type: 'upgrade', side: 'player', nodeId },
    );
    this.deselect();
  }

  private toggleSpell(spell: SpellId): void {
    if (this.paused || this.ended) return;
    this.deselect();
    this.armed = this.armed === spell ? null : spell;
  }

  // ---- Pause ------------------------------------------------------------------------------------

  private pause(): void {
    if (this.paused || this.ended) return;
    this.paused = true;
    this.deselect();
    this.drag = null;
    this.armed = null;
    this.platform.gameplayStop();
    this.hud.showPause(
      () => this.resume(),
      () => this.scene.restart({ levelId: this.level.id }),
    );
  }

  private resume(): void {
    this.paused = false;
    this.hud.hideOverlay();
    this.platform.gameplayStart();
  }

  /** Tab hidden: show the pause panel, so the player comes back to a paused battle. */
  private onHidden(): void {
    this.pause();
  }
}
