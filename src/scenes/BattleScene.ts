import * as Phaser from 'phaser';
import { DRAGON, SPEED_UP, TICK_MS, type SpellId } from '../config/balance';
import { ARMY_FX, COLORS, cssColor, DRAG_THRESHOLD_PX, HAPTICS, HUD, INFO_LABEL_MS, MAX_FRAME_DELTA_MS } from '../config/game';
import { aiParamsFromLevel, aiStep, createAi, type AiState } from '../core/ai/EnemyAI';
import type { LevelData } from '../core/level/schema';
import { sendAmount, type Command, type SendMode } from '../core/sim/commands';
import { armyPath, blockingNode, isPortalLink } from '../core/sim/pathfinding';
import { previewAttack } from '../core/sim/preview';
import { step, type TickEvent } from '../core/sim/tick';
import { goalProgressSec, type OutcomeReason } from '../core/sim/victory';
import { advanceTutorial, currentStep, startTutorial, type TutorialState, type UiEvent } from '../core/tutorial/tutorial';
import { createWorld, isRival, ownedShare, type NodeState, type Owner, type Side, type World } from '../core/sim/World';
import { t } from '../i18n/i18n';
import { applyBattleResult } from '../core/meta/rewards';
import { canOpenSpell } from '../core/meta/spellbook';
import { recordStars, starChecks, starTimeSec, type StarChecks } from '../core/meta/stars';
import { defeatTip } from '../core/meta/tips';
import { playerSetupFrom } from '../core/meta/upgrades';
import { FIRST_LEVEL, getLevel, nextLevel, TUTORIALS } from '../levels';
import type { Platform } from '../platform/Platform';
import { TutorialView } from '../view/TutorialView';
import { ArmyView, armyLevelPosition } from '../view/ArmyView';
import { BuildMenu, type BuildChoice } from '../view/BuildMenu';
import { explosion, floatText, pop, ringBurst } from '../view/effects';
import { FieldLayout, fieldArea, px, textStyle, type Point } from '../view/layout';
import { NodeView, type Highlight } from '../view/NodeView';
import { RoadView } from '../view/RoadView';
import { isSoundEnabled, playSfx, setSoundEnabled } from '../view/sound';
import { drawMeadow } from '../view/ui';
import { BattleHUD } from './BattleHUD';
import { getPlatform, getStore } from './registry';

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
  /** Second enemy (three-side levels), null otherwise. */
  private ai2: AiState | null = null;
  private layoutField!: FieldLayout;

  private background!: Phaser.GameObjects.Graphics;
  private roads!: RoadView;
  private dragLines!: Phaser.GameObjects.Graphics;
  /** Fading dots behind marching armies; one Graphics for all of them. */
  private trails!: Phaser.GameObjects.Graphics;
  /** Hold goal: timer ring around the node to hold. */
  private goalRing!: Phaser.GameObjects.Graphics;
  /** Node owners before the current tick, to tell "captured" from "lost" in arrival events. */
  private ownersBefore = new Map<string, Owner>();
  private capitals = new Set<string>();
  /** Short info label for a special node (shown on tap). */
  private infoLabel: Phaser.GameObjects.Text | null = null;
  /** Armies currently inside a portal (hidden). */
  private inPortal = new Set<string>();
  /** Battle facts for the star rating and the defeat tip. */
  private stats = { lostOwnNode: false, builtBarracks: false, builtMine: false, hadVeinWithoutMine: false };
  /** "How many will leave" badge for a swipe or a selected node; one reused Text. */
  private sendBadge!: Phaser.GameObjects.Text;
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
  /** Simulation speed: 1, or SPEED_UP.multiplier while the speed-up is on. */
  private speed = 1;

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
    this.speed = 1;
    this.infoLabel = null;
    this.inPortal = new Set();
    this.stats = { lostOwnNode: false, builtBarracks: false, builtMine: false, hadVeinWithoutMine: false };

    this.platform = getPlatform(this);
    // Seed per level: the AI's timing jitter is reproducible for a given level.
    // Player bonuses, start army and open spells come from meta progression.
    this.world = createWorld(this.level, {
      seed: this.level.chapter * 100 + this.level.index,
      player: playerSetupFrom(getStore(this).progress),
    });
    this.ai = createAi('enemy', aiParamsFromLevel(this.level.enemy, this.world.goal, this.world.capitals.player));
    const enemy2 = this.level.enemy2;
    this.ai2 = enemy2 && this.level.nodes.some((n) => n.owner === 'enemy2') ? createAi('enemy2', aiParamsFromLevel(enemy2)) : null;
    const script = this.level.tutorial ? TUTORIALS[this.level.tutorial] : undefined;
    this.tutorial = script ? startTutorial(script, this.world.tick) : null;

    this.background = this.add.graphics();
    this.roads = new RoadView(this);
    this.capitals = new Set(this.level.nodes.filter((n) => n.capital).map((n) => n.id));
    for (const node of Object.values(this.world.nodes)) {
      this.nodeViews.set(node.id, new NodeView(this, node, this.capitals.has(node.id)));
    }
    this.trails = this.add.graphics().setDepth(39);
    this.goalRing = this.add.graphics().setDepth(38);
    this.dragLines = this.add.graphics().setDepth(50);
    this.sendBadge = this.add.text(0, 0, '', textStyle(20)).setOrigin(0.5).setStroke('#1f2937', px(5)).setDepth(60);
    this.sendBadge.setVisible(false);
    this.hud = new BattleHUD(this, t('level.title', { index: this.level.index }), this.world.sides.player.unlockedSpells, {
      onPause: () => this.pause(),
      onSpeed: () => this.toggleSpeed(),
      onSpell: (spell) => this.toggleSpell(spell),
    });
    this.tutorialView = this.tutorial ? new TutorialView(this) : null;

    this.relayout();
    if (this.tutorial) this.tutorialView!.show(currentStep(this.tutorial), HUD.bottomBar);

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

    // Enemy leader: portrait in the HUD and a short card before the battle (the battle waits for it).
    const leader = this.level.enemy.leader ?? null;
    this.hud.setLeader(leader);
    if (leader) {
      this.paused = true;
      this.hud.showLeaderCard(leader, () => {
        if (!this.ended) this.paused = false;
      });
    }
  }

  override update(time: number, delta: number): void {
    if (!this.paused && !this.ended) {
      this.accumulator += Math.min(delta, MAX_FRAME_DELTA_MS) * this.speed;
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
    for (const node of Object.values(this.world.nodes)) this.ownersBefore.set(node.id, node.owner);
    for (const army of this.world.armies) this.prevArmyPos.set(army.id, armyLevelPosition(this.world, army));

    // Player input and the enemy AI go through the same command queue and rules.
    const commands = [...this.queue, ...aiStep(this.world, this.ai), ...(this.ai2 ? aiStep(this.world, this.ai2) : [])];
    this.queue = [];
    const events = step(this.world, commands);
    for (const event of events) this.handleEvent(event);
    this.showNoPath(events);
    if (!this.stats.hadVeinWithoutMine) {
      this.stats.hadVeinWithoutMine = Object.values(this.world.nodes).some(
        (n) => n.owner === 'player' && n.hasGoldVein && n.building?.type !== 'mine',
      );
    }

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
          if (cmd.side === 'player') playSfx('send');
        } else if (cmd.type === 'build' || cmd.type === 'upgrade') {
          if (cmd.side === 'player') {
            playSfx('build');
            if (cmd.type === 'build' && cmd.building === 'barracks') this.stats.builtBarracks = true;
            if (cmd.type === 'build' && cmd.building === 'mine') this.stats.builtMine = true;
          }
          const view = this.nodeViews.get(cmd.nodeId)!;
          pop(this, view);
          ringBurst(this, view.x, view.y, view.radius, COLORS.gold);
        } else if (cmd.type === 'cast') {
          const view = this.nodeViews.get(cmd.nodeId)!;
          if (cmd.spell === 'fireball') {
            explosion(this, view.x, view.y, view.radius * 1.3);
            playSfx('fireball');
            this.shake();
          } else if (cmd.spell === 'reinforcement') {
            ringBurst(this, view.x, view.y, view.radius, COLORS.reinforcement);
            pop(this, view);
          } else {
            ringBurst(this, view.x, view.y, view.radius * 1.3, COLORS.shield);
            pop(this, view);
            playSfx('build');
          }
        }
        break;
      }
      case 'arrived': {
        const view = this.nodeViews.get(event.nodeId)!;
        if (event.towerDamage > 0) floatText(this, view.x, view.y - view.radius, `-${event.towerDamage}`, COLORS.fireball);
        if (event.chestGold > 0) {
          floatText(this, view.x, view.y - view.radius * 1.4, t('battle.chestGold', { gold: event.chestGold }), COLORS.gold);
          ringBurst(this, view.x, view.y, view.radius * 1.2, COLORS.gold);
        }
        if (event.outcome === 'shielded') {
          ringBurst(this, view.x, view.y, view.radius * 1.3, COLORS.shield);
        }
        if (event.outcome === 'captured') {
          const owner = this.world.nodes[event.nodeId]!.owner;
          pop(this, view);
          ringBurst(this, view.x, view.y, view.radius, owner === 'neutral' ? COLORS.faction.neutral : COLORS.faction[owner]);
          if (this.selected === event.nodeId) this.deselect();
          const before = this.ownersBefore.get(event.nodeId);
          if (owner === 'player') {
            playSfx('capture');
            this.vibrate(HAPTICS.short);
            if (before !== undefined && isRival('player', before) && this.capitals.has(event.nodeId)) this.shake();
          } else if (before === 'player') {
            this.stats.lostOwnNode = true;
            playSfx('lost');
            this.vibrate(HAPTICS.short);
          }
          // Later arrivals in the same tick compare against the new owner.
          this.ownersBefore.set(event.nodeId, owner);
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
      case 'raid': {
        // Bandits leave their camp.
        const from = this.world.nodes[event.from]!;
        this.prevArmyPos.set(event.armyId, { x: from.x, y: from.y });
        const view = this.nodeViews.get(event.from)!;
        ringBurst(this, view.x, view.y, view.radius, COLORS.bandits);
        break;
      }
      case 'dragonWarn':
        // The marked node gets a shadow and a red circle in drawGoal.
        break;
      case 'dragonStrike': {
        const view = this.nodeViews.get(event.nodeId)!;
        if (this.world.nodes[event.nodeId]!.shieldTicks > 0) {
          // The shield took the hit.
          ringBurst(this, view.x, view.y, view.radius * 1.5, COLORS.shield);
        } else {
          explosion(this, view.x, view.y, view.radius * 1.6);
          floatText(this, view.x, view.y - view.radius, `-${Math.floor(event.killed)}`, COLORS.fireball);
          this.shake();
        }
        playSfx('fireball');
        break;
      }
      case 'citadelWave': {
        const from = this.world.nodes[event.from]!;
        this.prevArmyPos.set(event.armyId, { x: from.x, y: from.y });
        const view = this.nodeViews.get(event.from)!;
        ringBurst(this, view.x, view.y, view.radius * 1.2, COLORS.faction.enemy);
        break;
      }
      case 'gameOver':
        this.endBattle(event.winner, event.reason);
        break;
      case 'rejected':
        // Player sends without a route are reported once per target in showNoPath.
        break;
    }
  }

  /**
   * Feedback for player sends without a route: "No route" over the target and a red ring on the foreign node
   * that blocks the way. Skipped when another army of the same order did go to that target (multi-node swipe).
   */
  private showNoPath(events: readonly TickEvent[]): void {
    const sentTo = new Set<string>();
    const blocked = new Map<string, string>();
    for (const event of events) {
      if (event.type !== 'applied' && event.type !== 'rejected') continue;
      const cmd = event.command;
      if (cmd.type !== 'send' || cmd.side !== 'player') continue;
      if (event.type === 'applied') sentTo.add(cmd.to);
      else if (event.reason === 'noPath' && !blocked.has(cmd.to)) blocked.set(cmd.to, cmd.from);
    }
    for (const [to, from] of blocked) {
      if (sentTo.has(to)) continue;
      const view = this.nodeViews.get(to);
      if (!view) continue;
      ringBurst(this, view.x, view.y, view.radius, COLORS.faction.enemy);
      floatText(this, view.x, view.y - view.radius, t('battle.noPath'), COLORS.faction.enemy);
      const blocker = blockingNode(this.world, 'player', from, to);
      const blockerView = blocker ? this.nodeViews.get(blocker) : undefined;
      if (blockerView) ringBurst(this, blockerView.x, blockerView.y, blockerView.radius * 1.2, COLORS.faction.enemy);
    }
  }

  private endBattle(winner: Side, reason: OutcomeReason): void {
    this.ended = true;
    this.deselect();
    this.drag = null;
    this.armed = null;
    this.platform.gameplayStop();
    this.tutorialView?.show(null);

    // Rewards are applied and saved right away, so leaving the result screen can't lose them.
    const store = getStore(this);
    const reward = applyBattleResult(store.progress, this.level, winner === 'player' ? 'victory' : 'defeat');
    const stars = starChecks({ won: winner === 'player', timeMs: this.world.tick * TICK_MS, lostOwnNode: this.stats.lostOwnNode }, this.level);
    recordStars(store.progress, this.level.id, stars.filter(Boolean).length);
    store.commit();
    playSfx(winner === 'player' ? 'victory' : 'defeat');
    if (winner === 'player') this.vibrate(HAPTICS.victory);
    this.time.delayedCall(RESULT_DELAY_MS, () => this.showResult(winner, reason, reward.crystals, stars));
  }

  private showResult(winner: Side, reason: OutcomeReason, crystals: number, checks: StarChecks): void {
    // Which goal was met (or why the battle was lost), plus the defeat tip.
    const why = t(`goal.reason.${reason}`);
    const replay = { label: t('result.playAgain'), onClick: () => this.scene.restart({ levelId: this.level.id }) };
    const toMap = { label: t('result.toMap'), onClick: () => this.toMap() };
    const total = getStore(this).progress.crystals;
    if (winner !== 'player') {
      const tip = defeatTip(this.stats, getStore(this).progress);
      const buttons = [replay, toMap];
      if (tip === 'upgrades') {
        buttons.splice(1, 0, { label: t('menu.upgrades'), onClick: () => this.scene.start('UpgradesScene', { from: 'ChapterMapScene' }) });
      }
      this.hud.showResult(t('result.defeat'), false, crystals, total, buttons, { tip: tip ? `${why}\n${t(`tip.${tip}`)}` : why });
      return;
    }
    // Each star sits over the condition that earns it.
    const time = starTimeSec(this.level);
    const clock = `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
    const stars = {
      earned: checks,
      labels: [t('stars.won'), t('stars.fast', { time: clock }), t('stars.flawless')],
    };
    // A new spell slot was earned: point the player to the Upgrades screen to pick one.
    const winTip = canOpenSpell(getStore(this).progress) ? `${why}\n${t('result.newSpell')}` : why;
    const next = nextLevel(this.level.id);
    if (next) {
      this.hud.showResult(t('result.victory'), true, crystals, total, [
        { label: t('result.next'), onClick: () => this.scene.restart({ levelId: next.id }) },
        replay,
        toMap,
      ], { stars, tip: winTip });
    } else {
      this.hud.showResult(t('result.chapterDone'), true, crystals, total, [toMap, replay], { stars, tip: winTip });
    }
  }

  private toMap(): void {
    this.scene.start('ChapterMapScene', { chapter: this.level.chapter });
  }

  // ---- Rendering --------------------------------------------------------------------------------

  private relayout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    this.deselect();

    const nodes = Object.values(this.world.nodes);
    // The bottom bar is always reserved (spells and the build menu live there), and the hint bar stays
    // reserved for the whole level, so the field does not jump when the tutorial ends.
    const bottom = HUD.bottomBar + (this.tutorial ? HUD.hintBar : 0);
    const top = this.world.goal.type === 'conquer' && !this.world.boss ? 0 : HUD.goalBar;
    this.layoutField = new FieldLayout(nodes, fieldArea(w, h, bottom, top));
    drawMeadow(this.background, w, h);
    this.roads.draw(this.world, this.layoutField);
    for (const node of nodes) this.nodeViews.get(node.id)!.place(node, this.layoutField);
    this.hud.layout();
    this.tutorialView?.layout();
  }

  private render(alpha: number): void {
    const world = this.world;

    for (const node of Object.values(world.nodes)) {
      const view = this.nodeViews.get(node.id)!;
      view.sync(node);
      view.setHighlight(this.highlightFor(node));
    }

    // Armies: create/remove views, interpolate between ticks; a light bob and a fading trail while marching.
    const alive = new Set<string>();
    const now = this.time.now;
    this.trails.clear();
    for (const army of world.armies) {
      alive.add(army.id);
      let view = this.armyViews.get(army.id);
      if (!view) {
        view = new ArmyView(this, army.owner, Number(army.id.slice(1)) * 1.7).setDepth(40);
        this.armyViews.set(army.id, view);
      }
      view.setCount(army.count);
      const cur = armyLevelPosition(world, army);
      const prev = this.prevArmyPos.get(army.id) ?? cur;
      const p = this.layoutField.toScreen(prev.x + (cur.x - prev.x) * alpha, prev.y + (cur.y - prev.y) * alpha);
      view.setPosition(p.x, p.y);
      view.setScale(1 + ARMY_FX.bob * Math.sin(now / ARMY_FX.bobPeriodMs + view.phase));
      // Inside a portal the army is invisible; a flash marks entering and leaving.
      const next = army.path[army.segment + 1];
      const portal = next !== undefined && isPortalLink(world, army.path[army.segment]!, next);
      if (portal !== this.inPortal.has(army.id)) {
        const at = this.nodeViews.get(portal ? army.path[army.segment]! : next ?? army.targetId)!;
        ringBurst(this, at.x, at.y, at.radius * 0.8, COLORS.portal);
        if (portal) this.inPortal.add(army.id);
        else this.inPortal.delete(army.id);
      }
      view.setVisible(!portal);
      if (!portal) this.drawTrail(army.owner, army.path[army.segment]!, next, p);
    }
    for (const [id, view] of this.armyViews) {
      if (!alive.has(id)) {
        view.destroy();
        this.armyViews.delete(id);
        this.inPortal.delete(id);
      }
    }

    this.drawDragLines();
    this.drawSendBadge();
    this.drawGoal();
    this.hud.update(world, 'player', this.armed);
    this.syncSpeed();
    if (this.menu) {
      if (world.nodes[this.menu.nodeId]!.owner !== 'player') this.deselect();
      else this.menu.refresh(world.sides.player.gold);
    }
  }

  private highlightFor(node: NodeState): Highlight {
    if (this.armed) {
      const valid = this.armed === 'fireball' ? isRival('player', node.owner) && node.shieldTicks <= 0 : node.owner === 'player';
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

  /**
   * Swipe lines with the attack preview: green = predicted capture, yellow = not enough troops,
   * red = no route from that source, white = own target or no target yet.
   */
  private drawDragLines(): void {
    const g = this.dragLines;
    g.clear();
    const drag = this.drag;
    if (!drag?.moved) return;
    const hover = this.nodeAt(drag.x, drag.y);
    const end = hover ? this.nodeViews.get(hover.id)! : { x: drag.x, y: drag.y };

    let color: number = COLORS.select;
    if (hover && hover.owner !== 'player') {
      const preview = previewAttack(this.world, 'player', drag.sources, 'swipe', hover.id);
      if (preview.sent > 0) color = preview.wins ? COLORS.attackWin : COLORS.attackShort;
    }

    for (const id of drag.sources) {
      if (id === hover?.id) continue;
      const from = this.nodeViews.get(id)!;
      const lineColor = hover && !this.canReach(id, hover.id) ? COLORS.faction.enemy : color;
      g.lineStyle(px(9), COLORS.outline, 0.35).lineBetween(from.x, from.y, end.x, end.y);
      g.lineStyle(px(5), lineColor, 0.9).lineBetween(from.x, from.y, end.x, end.y);
    }
    g.fillStyle(color, 0.9).fillCircle(end.x, end.y, px(7));
  }

  /** Goal plaque text and the hold timer ring. */
  private drawGoal(): void {
    const goal = this.world.goal;
    const done = Math.floor(goalProgressSec(this.world));
    const boss = this.world.boss;
    switch (goal.type) {
      case 'conquer':
        // Boss levels use the plaque for the boss countdown.
        if (boss?.type === 'dragon') {
          const sec = Math.max(0, Math.ceil(((boss.strikeTick - this.world.tick) * TICK_MS) / 1000));
          this.hud.setGoal(t('boss.dragon', { sec }));
        } else if (boss?.type === 'citadel') {
          const sec = Math.max(0, Math.ceil(((boss.nextWaveTick - this.world.tick) * TICK_MS) / 1000));
          this.hud.setGoal(t('boss.citadel', { sec }));
        } else {
          this.hud.setGoal(null);
        }
        break;
      case 'capital':
        this.hud.setGoal(t('goal.capital'));
        break;
      case 'survive':
        this.hud.setGoal(t('goal.survive', { done: Math.min(done, goal.seconds), total: goal.seconds }));
        break;
      case 'hold':
        this.hud.setGoal(t('goal.hold', { done: Math.min(done, goal.seconds), total: goal.seconds }));
        break;
    }
    const g = this.goalRing;
    g.clear();
    // Dragon warning: shadow and a pulsing red circle over the marked node.
    if (boss?.type === 'dragon' && boss.targetId) {
      const view = this.nodeViews.get(boss.targetId)!;
      const left = Math.max(0, (boss.strikeTick - this.world.tick) * TICK_MS) / DRAGON.warnMs;
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 90);
      g.fillStyle(0x000000, 0.18 + 0.22 * (1 - left)).fillEllipse(view.x, view.y + view.radius * 0.2, view.radius * 3.2, view.radius * 1.6);
      g.lineStyle(px(5), COLORS.faction.enemy, 0.5 + 0.5 * pulse).strokeCircle(view.x, view.y, view.radius * (1.5 + 0.4 * left));
    }
    if (goal.type !== 'hold') return;
    const view = this.nodeViews.get(goal.nodeId);
    if (!view) return;
    const r = view.radius * 1.55;
    g.lineStyle(px(5), COLORS.outline, 0.35).strokeCircle(view.x, view.y, r);
    const frac = Math.min(1, goalProgressSec(this.world) / goal.seconds);
    if (frac > 0) {
      g.lineStyle(px(5), COLORS.hint, 1);
      g.beginPath().arc(view.x, view.y, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2).strokePath();
    }
  }

  /** Badge with the troops that will leave: at the swipe end, or above the selected node (tap-tap). */
  private drawSendBadge(): void {
    const badge = this.sendBadge;
    const drag = this.drag;
    let count = 0;
    let x = 0;
    let y = 0;
    let text = '';
    if (drag?.moved) {
      const hover = this.nodeAt(drag.x, drag.y);
      const end = hover ? this.nodeViews.get(hover.id)! : null;
      count = hover
        ? previewAttack(this.world, 'player', drag.sources, 'swipe', hover.id).sent
        : drag.sources.reduce((sum, id) => sum + sendAmount(this.world.nodes[id]!.troops, 'swipe'), 0);
      x = end ? end.x : drag.x;
      y = end ? end.y - end.radius * 1.34 - px(16) : drag.y - px(36);
      text = String(count);
    } else if (this.selected) {
      const view = this.nodeViews.get(this.selected)!;
      count = sendAmount(this.world.nodes[this.selected]!.troops, 'tap');
      x = view.x;
      y = view.y - view.radius * 1.34 - px(16);
      text = t('battle.sendCount', { count });
    }
    if (count <= 0) {
      badge.setVisible(false);
      return;
    }
    if (badge.text !== text) badge.setText(text);
    badge.setPosition(x, y).setVisible(true);
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
    else if (node) this.showInfo(node);
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
    const node = this.world.nodes[nodeId]!;
    this.showInfo(node);
    // Temples hold no buildings: no build menu, the info label explains why.
    if (node.kind === 'temple') return;
    this.menu = new BuildMenu(this, this.world.nodes[nodeId]!, (choice) => this.onBuild(nodeId, choice)).setDepth(90);
    this.menu.refresh(this.world.sides.player.gold);
    this.hud.setSpellBarVisible(false);
  }

  private deselect(): void {
    this.selected = null;
    if (this.menu) {
      this.menu.destroy();
      this.menu = null;
      this.hud.setSpellBarVisible(true);
    }
  }

  private onBuild(nodeId: string, choice: BuildChoice): void {
    this.queue.push(
      choice.kind === 'build'
        ? { type: 'build', side: 'player', nodeId, building: choice.building }
        : { type: 'upgrade', side: 'player', nodeId },
    );
    this.deselect();
  }

  /** 2–3 fading dots behind an army, along its current road. */
  private drawTrail(owner: Owner, fromId: string, toId: string | undefined, at: Point): void {
    if (!toId) return;
    const a = this.nodeViews.get(fromId)!;
    const b = this.nodeViews.get(toId)!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) return;
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    const travelled = Math.hypot(at.x - a.x, at.y - a.y);
    const step = px(ARMY_FX.trailSpacing);
    for (let i = 1; i <= ARMY_FX.trailDots; i++) {
      // No dots behind the start node: the trail grows as the army leaves.
      if (i * step > travelled) break;
      const fade = 1 - i / (ARMY_FX.trailDots + 1);
      this.trails.fillStyle(COLORS.faction[owner], 0.55 * fade).fillCircle(at.x - dx * step * i, at.y - dy * step * i, px(5) * fade);
    }
  }

  /** Name and effect of a special node, above it for a few seconds. */
  private showInfo(node: NodeState): void {
    this.infoLabel?.destroy();
    this.infoLabel = null;
    if (node.kind === 'normal') return;
    const view = this.nodeViews.get(node.id)!;
    const label = this.add
      .text(view.x, view.y - view.radius * 1.5 - px(24), `${t(`kind.${node.kind}`)}\n${t(`kind.${node.kind}.desc`)}`, textStyle(14, COLORS.textDark))
      .setOrigin(0.5, 1)
      .setAlign('center')
      .setBackgroundColor(cssColor(COLORS.panel))
      .setPadding(px(8), px(5), px(8), px(5))
      .setDepth(95);
    label.setX(Math.min(Math.max(view.x, label.width / 2 + px(4)), this.scale.width - label.width / 2 - px(4)));
    label.setY(Math.max(label.y, px(HUD.topBar) + label.height + px(4)));
    this.infoLabel = label;
    this.tweens.add({ targets: label, alpha: 0, delay: INFO_LABEL_MS, duration: 300, onComplete: () => label.destroy() });
  }

  private shake(): void {
    this.cameras.main.shake(HAPTICS.shakeMs, HAPTICS.shakeIntensity);
  }

  /** Vibration follows the sound setting. */
  private vibrate(pattern: number | readonly number[]): void {
    if (isSoundEnabled()) this.platform.vibrate(pattern);
  }

  private toggleSound(): void {
    const store = getStore(this);
    store.settings.sound = !store.settings.sound;
    setSoundEnabled(store.settings.sound);
    store.commit();
  }

  // ---- Speed-up ---------------------------------------------------------------------------------

  /** The speed-up is offered only while the player holds more than SPEED_UP.unlockShare of all nodes. */
  private speedAvailable(): boolean {
    return ownedShare(this.world, 'player') > SPEED_UP.unlockShare;
  }

  private syncSpeed(): void {
    const available = !this.ended && this.speedAvailable();
    if (!available) this.speed = 1;
    this.hud.setSpeed(available, this.speed);
  }

  private toggleSpeed(): void {
    if (this.paused || this.ended || !this.speedAvailable()) return;
    this.speed = this.speed === 1 ? SPEED_UP.multiplier : 1;
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
    // Leaving mid-battle counts as nothing: no reward and no defeat consolation.
    this.hud.showPause(
      () => this.resume(),
      () => this.scene.restart({ levelId: this.level.id }),
      () => this.toMap(),
      { on: isSoundEnabled(), toggle: () => this.toggleSound() },
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
