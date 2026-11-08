import * as Phaser from 'phaser';
import { DRAGON, ECONOMY, MAGE, SPEED_UP, TICK_MS, type BuildingType, type SpellId } from '../config/balance';
import { COLORS, DEV_TOOLS, DRAG_THRESHOLD_PX, FX_COLORS, HAPTICS, HUD, INFO_LABEL_MS, INTRO_CARD, MAGE_FX, MAX_FRAME_DELTA_MS, MUSIC, SHOW_LEADER_INTRO, SPARK_FX, UNITS_FX, type JingleId } from '../config/game';
import { battleTrack, resultJingle } from '../core/audio/playlist';
import { aiParamsFromLevel, aiStep, createAi, type AiState } from '../core/ai/EnemyAI';
import type { LevelData } from '../core/level/schema';
import { sendAmount, type Command } from '../core/sim/commands';
import { armyPath, blockingNode } from '../core/sim/pathfinding';
import { contestStep, createContest, type ContestState } from '../core/dev/contest';
import { createStress, stressStep, type StressState } from '../core/dev/stress';
import { battleSpeed, runClock } from '../core/sim/clock';
import { previewAttack } from '../core/sim/preview';
import { step, type TickEvent } from '../core/sim/tick';
import { goalProgressSec, type OutcomeReason } from '../core/sim/victory';
import {
  advanceTutorial,
  currentStep,
  introCardFor,
  shouldRunTutorial,
  startTutorial,
  isTutorialSlow,
  type TutorialState,
  type UiEvent,
} from '../core/tutorial/tutorial';
import { enemyMayAct, gateLocked, isCommandAllowed, isSendAllowed, isUiAllowed, lessonActive, type GateUi } from '../core/tutorial/gate';
import { createWorld, isRival, ownedShare, type NodeState, type Owner, type Side, type World } from '../core/sim/World';
import { t } from '../i18n/i18n';
import { applyBattleResult } from '../core/meta/rewards';
import { tourStep } from '../core/meta/onboarding';
import { activeSpell, claimableSpell, grantWinSpells } from '../core/meta/spellbook';
import { bestStars, recordStars, starChecks, starTimeSec, type StarChecks } from '../core/meta/stars';
import { isCompleted } from '../core/meta/Progress';
import { defeatTip } from '../core/meta/tips';
import { featureLevel, isFeatureAvailable, isGoldVisible, isLearned, learnByBuilding } from '../core/meta/unlocks';
import { playerSetupFrom } from '../core/meta/upgrades';
import { ALL_LEVELS, CONTEST_LEVEL, FIRST_LEVEL, getLevel, nextLevel, STRESS_LEVEL, TUTORIALS } from '../levels';
import type { Platform } from '../platform/Platform';
import { TutorialView } from '../view/TutorialView';
import { BuildMenu, type BuildChoice } from '../view/BuildMenu';
import { explosion, floatText, goldFloat, pop, ringBurst } from '../view/effects';
import { FieldLayout, fieldArea, px, textStyle } from '../view/layout';
import { drawMagePicture, NodeView, type Highlight } from '../view/NodeView';
import { showIntroCard } from '../view/introCard';
import { SHOWN_OWNER_CHANGED } from '../view/displayFilter';
import { PERF_AUTO_END_MS, perfFlag } from '../dev/perfFlags';
import { BakedLayer } from '../view/BakedLayer';
import { RoadView } from '../view/RoadView';
import { FlashPool, UnitsView } from '../view/UnitsView';
import { ParticleBursts } from '../view/ParticleBursts';
import { audioFiles, canPlayJingle, playJingle, playMusic, setMusicDucked, stopMusic } from '../view/music';
import { SettingsPanel } from '../view/SettingsPanel';
import { isSoundEnabled, playSfx } from '../view/sound';
import { hintLabel } from '../view/hintPlaque';
import { drawMeadow } from '../view/ui';
import { BattleHUD } from './BattleHUD';
import type { ChapterMapData, MapReveal } from './ChapterMapScene';
import { getPlatform, getStore } from './registry';
import { settingsModel } from './settings';

/** Units the stress driver keeps on the field on dev_stress (ARCHITECTURE.md «Производительность»). */
const STRESS_UNITS = 600;

/** The settings panel opens over the pause panel (the HUD overlay is at 200). */
const SETTINGS_DEPTH = 210;

/** Spark colors per side: the faction color and its light tone (docs/FX.md FX-2). */
const SPARK_COLORS: Record<Owner, readonly number[]> = {
  player: [COLORS.faction.player, FX_COLORS.factionLight.player],
  enemy: [COLORS.faction.enemy, FX_COLORS.factionLight.enemy],
  enemy2: [COLORS.faction.enemy2, FX_COLORS.factionLight.enemy2],
  neutral: [COLORS.faction.neutral, FX_COLORS.factionLight.neutral],
};

/** Release sparks (FX-3): the player's light tone. */
const RELEASE_COLORS: readonly number[] = [FX_COLORS.factionLight.player];
/** How many of the newest units a release looks through for the one that just left (its road gives the direction). */
const RELEASE_LOOKBACK = 16;

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

  /** The meadow, drawn off the display list and baked with the roads into `ground` (docs/PERF.md PF-G). */
  private background!: Phaser.GameObjects.Graphics;
  private ground!: BakedLayer;
  private roads!: RoadView;
  private dragLines!: Phaser.GameObjects.Graphics;
  /** All units on the field, one batch (under the nodes, so a unit leaves and enters a node from its rim). */
  private units!: UnitsView;
  /** Capped flashes of clashes, tower shots and trades at nodes. */
  private flashes!: FlashPool;
  /** Sparks of hits and releases (docs/FX.md FX-2, FX-3); null with `?perf=nofx`. */
  private sparks: ParticleBursts | null = null;
  /** Last time the clash sound played (rate-limited). */
  private lastClashSoundAt = -Infinity;
  /** Dev only: FPS and unit counter. */
  private fpsText: Phaser.GameObjects.Text | null = null;
  private fpsShownAt = 0;
  /** Dev only: the stress driver on dev_stress (instead of the AIs). */
  private stress: StressState | null = null;
  /** Dev only: the contest driver on dev_contest (instead of the AIs). */
  private contest: ContestState | null = null;
  /** Hold goal: timer ring around the node to hold. */
  private goalRing!: Phaser.GameObjects.Graphics;
  /** Node owners before the current tick, to tell "captured" from "lost" in arrival events. */
  private ownersBefore = new Map<string, Owner>();
  private capitals = new Set<string>();
  /** Short info label for a special node (shown on tap). */
  private infoLabel: Phaser.GameObjects.Container | null = null;
  /** Battle facts for the star rating and the defeat tip. */
  private stats = { lostOwnNode: false, builtBarracks: false, builtMine: false, hadVeinWithoutMine: false };
  /** After a win: what the chapter map animates when the player goes there from the result panel (V-3). */
  private mapReveal: MapReveal | null = null;
  /** Spells this win gave (TUTORIAL.md T-3), for the result panel. */
  private newSpells: SpellId[] = [];
  /** "How many will leave" badge at the end of a swipe; one reused Text. */
  private sendBadge!: Phaser.GameObjects.Text;
  private hud!: BattleHUD;
  private nodeViews = new Map<string, NodeView>();

  private queue: Command[] = [];
  private accumulator = 0;
  private paused = false;
  private ended = false;
  /** Own node whose build menu is open (sends are swipe-only, there is no tap-to-send selection). */
  private selected: string | null = null;
  private menu: BuildMenu | null = null;
  /** The settings panel over the pause panel, if open. */
  private settingsPanel: SettingsPanel | null = null;
  private drag: DragState | null = null;
  private armed: SpellId | null = null;
  private tutorial: TutorialState | null = null;
  private tutorialView: TutorialView | null = null;
  private uiEvents: UiEvent[] = [];
  /** Simulation speed: 1, or SPEED_UP.multiplier while the speed-up is on. */
  private speed = 1;
  /** Battle effects of docs/FX.md; off with the dev flag `?perf=nofx` (A/B profiling, FX-0). */
  private fx = true;

  constructor() {
    super('BattleScene');
  }

  init(data: BattleSceneData): void {
    this.level = (data.levelId && getLevel(data.levelId)) || FIRST_LEVEL;
  }

  create(): void {
    // The scene instance is reused on restart: reset all state.
    this.nodeViews = new Map();
    this.lastClashSoundAt = -Infinity;
    this.fpsText = null;
    this.queue = [];
    this.accumulator = 0;
    this.paused = false;
    this.ended = false;
    this.selected = null;
    this.menu = null;
    this.settingsPanel = null;
    this.drag = null;
    this.armed = null;
    this.uiEvents = [];
    this.speed = 1;
    this.fx = !(import.meta.env.DEV && perfFlag('nofx'));
    this.infoLabel = null;
    this.stats = { lostOwnNode: false, builtBarracks: false, builtMine: false, hadVeinWithoutMine: false };
    this.mapReveal = null;
    this.newSpells = [];

    this.platform = getPlatform(this);
    // Seed per level: the AI's timing jitter is reproducible for a given level.
    // Player bonuses, start army and open spells come from meta progression.
    this.world = createWorld(this.level, {
      seed: this.level.chapter * 100 + this.level.index,
      player: playerSetupFrom(getStore(this).progress),
    });
    // Hints, the slow-down and the lesson gate only on the first playthrough (TUTORIAL.md T-4, PLAYTEST-1 F-6).
    const levelScript = this.level.tutorial ? TUTORIALS[this.level.tutorial] : undefined;
    const script = shouldRunTutorial(this.level, getStore(this).progress, levelScript) ? levelScript : undefined;
    this.tutorial = script ? startTutorial(script, this.world.tick) : null;
    // On a lesson the enemy waits for its end instead of the level's start delay (that one is for replays).
    const lesson = lessonActive(this.tutorial);
    const aiParams = aiParamsFromLevel(this.level.enemy, this.world.goal, this.world.capitals.player);
    this.ai = createAi('enemy', lesson ? { ...aiParams, startDelayMs: 0 } : aiParams);
    const enemy2 = this.level.enemy2;
    this.ai2 = enemy2 && this.level.nodes.some((n) => n.owner === 'enemy2') ? createAi('enemy2', aiParamsFromLevel(enemy2)) : null;

    // Meadow and roads change only on relayout: one baked texture at the bottom of the display list.
    this.ground = new BakedLayer(this, 'battle-ground');
    this.background = this.make.graphics({}, false);
    this.roads = new RoadView(this);
    this.units = new UnitsView(this);
    this.capitals = new Set(this.level.nodes.filter((n) => n.capital).map((n) => n.id));
    for (const node of Object.values(this.world.nodes)) {
      const mageTower = this.world.boss?.type === 'mage' && this.world.boss.towerId === node.id;
      this.nodeViews.set(node.id, new NodeView(this, node, this.capitals.has(node.id), mageTower));
    }
    this.flashes = new FlashPool(this, 45);
    this.sparks = this.fx ? new ParticleBursts(this, 46, SPARK_FX.max) : null;
    if (import.meta.env.DEV) {
      if (DEV_TOOLS.showFps) this.fpsText = this.add.text(0, 0, '', textStyle(13)).setStroke('#1f2937', px(3)).setDepth(400);
      this.stress = this.level.id === STRESS_LEVEL.id ? createStress() : null;
      this.contest = this.level.id === CONTEST_LEVEL.id ? createContest() : null;
    }
    this.goalRing = this.add.graphics().setDepth(38);
    this.dragLines = this.add.graphics().setDepth(50);
    this.sendBadge = this.add.text(0, 0, '', textStyle(20)).setOrigin(0.5).setStroke('#1f2937', px(5)).setDepth(60);
    this.sendBadge.setVisible(false);
    this.hud = new BattleHUD(this, t('level.title', { index: this.level.index }), this.world.sides.player.unlockedSpells, {
      onPause: () => this.pause(),
      onSpeed: () => this.toggleSpeed(),
      onSpell: (spell) => this.toggleSpell(spell),
    });
    // The victory panel's star and crystal textures, baked now rather than on the frame the panel opens (PF-7).
    this.hud.prebakeResultIcons();
    // Gold stays hidden until there is something to spend it on (TUTORIAL.md T-3); it is still earned.
    this.hud.setGoldVisible(isGoldVisible(this.level.id, getStore(this).progress, ALL_LEVELS));
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
      // Off the display list, so the scene doesn't destroy them itself.
      this.background.destroy();
      this.roads.destroy();
      this.tutorialView?.destroy();
      this.tutorialView = null;
      setMusicDucked(false);
    });
    // Same level, same track: "Play again" keeps it, "Next" crossfades to the next level's one.
    playMusic(battleTrack(this.level, MUSIC.battleTracks, audioFiles()));

    // The evil mage card (PLAYTEST-1 F-8): on the first playthrough of the mage level, before the battle, on a full
    // pause; read as long as needed, the battle and GameplayAPI start on "To battle".
    if (introCardFor(this.level, getStore(this).progress, levelScript) === 'mage') {
      this.paused = true;
      showIntroCard(this, {
        accent: COLORS.mage,
        picture: drawMagePicture,
        pictureSize: INTRO_CARD.magePicture,
        title: t('mage.card.title'),
        body: t('mage.card.body', { sec: MAGE.everyMs / 1000 }),
        button: t('mage.card.go'),
        onClose: () => {
          this.paused = false;
          this.platform.gameplayStart();
        },
      });
    } else {
      this.platform.gameplayStart();
    }

    // Enemy leader: portrait in the HUD and a short card before the battle (the battle waits for it).
    // Turned off by SHOW_LEADER_INTRO; the leader still drives the AI behavior.
    const leader = SHOW_LEADER_INTRO ? (this.level.enemy.leader ?? null) : null;
    this.hud.setLeader(leader);
    if (leader) {
      this.paused = true;
      this.hud.showLeaderCard(leader, () => {
        if (!this.ended) this.paused = false;
      });
    }
  }

  override update(time: number, delta: number): void {
    if (import.meta.env.DEV) this.perfAutoEnd();
    if (!this.paused && !this.ended) {
      // While the player is choosing, the whole battle runs slowed down (sim/clock.ts);
      // the choice can end mid-frame, so the speed is re-read every tick.
      this.accumulator = runClock(
        this.accumulator,
        Math.min(delta, MAX_FRAME_DELTA_MS),
        () => battleSpeed(this.speed, this.isChoosing()),
        () => {
          this.tickOnce();
          return !this.ended;
        },
      );
    }
    this.render(this.ended ? 1 : this.accumulator / TICK_MS);
    this.tutorialView?.update(time, {
      node: (id) => this.nodeViews.get(id) ?? null,
      ui: (anchor) => this.hud.anchor(anchor),
      bossTarget: () => (this.world.boss && 'targetId' in this.world.boss ? this.world.boss.targetId : null),
      build: (type) => this.menu?.buttonPosition(type) ?? null,
    });
  }

  // ---- Simulation -------------------------------------------------------------------------------

  private tickOnce(): void {
    for (const node of Object.values(this.world.nodes)) this.ownersBefore.set(node.id, node.owner);

    // Player input and the enemy AI go through the same command queue and rules.
    const commands = this.stress
      ? stressStep(this.world, this.stress, STRESS_UNITS)
      : this.contest
        ? [...this.queue, ...contestStep(this.world, this.contest)]
        : enemyMayAct(this.tutorial)
          ? [...this.queue, ...aiStep(this.world, this.ai), ...(this.ai2 ? aiStep(this.world, this.ai2) : [])]
          : // The lesson runs first: the enemy makes no decisions until it is over (F-6).
            this.queue;
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
        if (cmd.type === 'send' && event.streamId !== undefined) {
          if (cmd.side === 'player') playSfx('send');
        } else if (cmd.type === 'build' || cmd.type === 'upgrade') {
          if (cmd.side === 'player') {
            playSfx('build');
            if (cmd.type === 'build' && cmd.building === 'barracks') this.stats.builtBarracks = true;
            if (cmd.type === 'build' && cmd.building === 'mine') this.stats.builtMine = true;
            // Built on its lesson: open in every battle from now on, saved at once (F-5).
            if (cmd.type === 'build' && learnByBuilding(getStore(this).progress, cmd.building, this.level.id)) {
              getStore(this).commit();
              getStore(this).flush();
            }
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
        // Gold for a chest or a neutral node (F-4): a "+N" with a coin, only while the gold counter is shown.
        if (event.captureGold > 0 && event.owner === 'player' && this.hud.isGoldVisible) {
          goldFloat(this, view.x, view.y - view.radius * 1.4, t('battle.captureGold', { gold: event.captureGold }));
          if (event.captureGold > ECONOMY.neutralCaptureGold) ringBurst(this, view.x, view.y, view.radius * 1.2, COLORS.gold);
        }
        if (event.outcome === 'shielded') {
          ringBurst(this, view.x, view.y, view.radius * 1.3, COLORS.shield);
        }
        if (event.outcome === 'captured') {
          // The pop, sound and vibration wait for the node to show its new owner (F-2: no crackle on a ping-pong).
          const owner = this.world.nodes[event.nodeId]!.owner;
          if (this.selected === event.nodeId) this.deselect();
          if (this.ownersBefore.get(event.nodeId) === 'player' && owner !== 'player') this.stats.lostOwnNode = true;
          // Later arrivals in the same tick compare against the new owner.
          this.ownersBefore.set(event.nodeId, owner);
        } else if (event.outcome === 'destroyedByTower' || event.outcome === 'repelled') {
          // A tower shot or a 1:1 trade: a capped flash on the rim, on the side the unit came from.
          const from = this.nodeViews.get(event.fromId)!;
          const dx = from.x - view.x;
          const dy = from.y - view.y;
          const len = Math.hypot(dx, dy) || 1;
          const color = event.outcome === 'destroyedByTower' ? COLORS.fireball : COLORS.faction[event.owner];
          const rimX = view.x + (dx / len) * view.radius;
          const rimY = view.y + (dy / len) * view.radius;
          // TODO(design): FX-2 — keep the rim flash next to the sparks or drop it; compare with `?perf=norimflash`.
          if (!(import.meta.env.DEV && perfFlag('norimflash'))) this.flashes.flash(rimX, rimY, color, this.time.now);
          if (this.sparks) this.showHit(view, event.owner, rimX, rimY, Math.atan2(dy, dx));
        }
        break;
      }
      case 'clash': {
        // Many pairs meet at one point: one flash per spot every UNITS_FX.flashEverySpotMs, a rate-limited sound.
        const p = this.units.screenAt(this.world, this.layoutField, event.lane, event.progress, { x: 0, y: 0 });
        this.flashes.flash(p.x, p.y, COLORS.select, this.time.now);
        if (this.time.now - this.lastClashSoundAt >= UNITS_FX.clashSoundEveryMs) {
          this.lastClashSoundAt = this.time.now;
          playSfx('clash');
        }
        break;
      }
      case 'transit':
        // A unit passing an own node joins its garrison for a moment: nothing to show.
        break;
      case 'raid': {
        // Bandits leave their camp.
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
      case 'mageWarning':
        // The marked node gets a red circle in drawGoal.
        break;
      case 'mageStrike':
        this.mageFireball(event.from, event.nodeId, event.killed);
        break;
      case 'citadelWave': {
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

  /** Dev only (docs/PERF.md PF-7): `?perf=win|lose|pause` ends or pauses the battle by itself, for profiling. */
  private perfAutoEnd(): void {
    if (this.ended || this.paused || this.world.tick * TICK_MS < PERF_AUTO_END_MS) return;
    if (perfFlag('win')) this.endBattle('player', 'conquer');
    else if (perfFlag('lose')) this.endBattle('enemy', 'capitalLost');
    else if (perfFlag('pause')) this.pause();
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
    // Read before the result is applied: the map shows the change from this state.
    const firstWin = !isCompleted(store.progress, this.level.id);
    const previousStars = bestStars(store.progress, this.level.id);
    const reward = applyBattleResult(store.progress, this.level, winner === 'player' ? 'victory' : 'defeat');
    if (winner === 'player') this.newSpells = grantWinSpells(store.progress, this.level.id);
    const stars = starChecks({ won: winner === 'player', timeMs: this.world.tick * TICK_MS, lostOwnNode: this.stats.lostOwnNode }, this.level);
    const starCount = stars.filter(Boolean).length;
    recordStars(store.progress, this.level.id, starCount);
    store.commit();
    this.mapReveal = winner === 'player' ? { levelId: this.level.id, stars: starCount, previousStars, unlocked: firstWin } : null;

    // The music fades out; the jingle comes with the result panel. Without a jingle the synth effect plays now.
    const won = winner === 'player';
    const next = nextLevel(this.level.id);
    const chapterDone = won && next?.chapter !== this.level.chapter;
    const jingle: JingleId | null = resultJingle(won, starCount, chapterDone, audioFiles());
    // Dev `?perf=nojingle` (PF-7): no jingle and no result sound.
    const silent = import.meta.env.DEV && perfFlag('nojingle');
    const withJingle = !silent && canPlayJingle(jingle);
    stopMusic(MUSIC.endFadeMs);
    if (!withJingle && !silent) playSfx(won ? 'victory' : 'defeat');
    if (won) this.vibrate(HAPTICS.victory);
    this.time.delayedCall(RESULT_DELAY_MS, () => {
      if (withJingle) playJingle(jingle);
      this.showResult(winner, reason, reward.crystals, stars);
    });
  }

  private showResult(winner: Side, reason: OutcomeReason, crystals: number, checks: StarChecks): void {
    // Which goal was met (or why the battle was lost), plus the defeat tip.
    const why = t(`goal.reason.${reason}`);
    const replay = { label: t('result.playAgain'), onClick: () => this.scene.restart({ levelId: this.level.id }) };
    const toMap = { label: t('result.toMap'), onClick: () => this.toMap() };
    const total = getStore(this).progress.crystals;
    if (winner !== 'player') {
      const progress = getStore(this).progress;
      // Tips only suggest what the player has learned or opened (F-5).
      const tip = defeatTip(this.stats, progress, {
        barracks: isLearned(progress, 'barracks'),
        mine: isLearned(progress, 'mine'),
        upgrades: isFeatureAvailable('upgrades', this.level.id, progress, ALL_LEVELS),
      });
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
    const winTip = [why, ...this.spellNews()].join('\n');
    // Dev `?perf=nostars` / `?perf=notip` (PF-7): the victory panel without stars / without the tip.
    const extras = {
      ...(import.meta.env.DEV && perfFlag('nostars') ? {} : { stars }),
      ...(import.meta.env.DEV && perfFlag('notip') ? {} : { tip: winTip }),
    };
    const next = nextLevel(this.level.id);
    if (next) {
      this.hud.showResult(t('result.victory'), true, crystals, total, [
        // After the first win on level 6 "Next" goes to the map, where the Upgrades tour starts (TUTORIAL.md T-6).
        { label: t('result.next'), onClick: () => (tourStep(getStore(this).progress) !== null ? this.toMap() : this.scene.restart({ levelId: next.id })) },
        replay,
        toMap,
      ], extras);
    } else {
      this.hud.showResult(t('result.chapterDone'), true, crystals, total, [toMap, replay], extras);
    }
  }

  /**
   * Result lines about spells (TUTORIAL.md T-3): "New spell: X" for spells this win gave, plus the switch hint when
   * the new one did not become active; or a pointer to the Upgrades screen when a spell waits to be claimed there.
   */
  private spellNews(): string[] {
    const progress = getStore(this).progress;
    if (this.newSpells.length > 0) {
      const lines = this.newSpells.map((spell) => t('result.newSpell', { spell: t(`spell.${spell}`) }));
      if (this.newSpells.some((spell) => spell !== activeSpell(progress))) lines.push(t('result.switchSpellHint'));
      return lines;
    }
    return claimableSpell(progress) ? [t('result.spellWaiting')] : [];
  }

  /** A mage fireball flies from the tower to the struck node, then bursts there (or on its shield). */
  private mageFireball(fromId: string, toId: string, killed: number): void {
    const from = this.nodeViews.get(fromId);
    const to = this.nodeViews.get(toId);
    if (!from || !to) return;
    const ball = this.add.graphics().setDepth(70);
    ball.fillStyle(COLORS.fireball, 1).fillCircle(0, 0, px(11));
    ball.fillStyle(COLORS.hint, 1).fillCircle(0, 0, px(5));
    ball.setPosition(from.x, from.y - from.radius * 1.6);
    playSfx('fireball');
    this.tweens.add({
      targets: ball,
      x: to.x,
      y: to.y,
      duration: MAGE_FX.flightMs,
      ease: 'Quad.In',
      onComplete: () => {
        ball.destroy();
        if (killed > 0) {
          explosion(this, to.x, to.y, to.radius * 1.6);
          floatText(this, to.x, to.y - to.radius, `-${Math.floor(killed)}`, COLORS.fireball);
          this.shake();
        } else {
          // A shield (or a node that is no longer ours) took the hit.
          ringBurst(this, to.x, to.y, to.radius * 1.5, COLORS.shield);
        }
      },
    });
  }

  /** "Opens at level N" for a building the player has not been taught yet; null if it can be built. */
  private buildingLock(type: BuildingType): string | null {
    if (isFeatureAvailable(type, this.level.id, getStore(this).progress, ALL_LEVELS)) return null;
    const at = featureLevel(type, ALL_LEVELS);
    return at ? t('lock.atLevel', { index: at.index }) : t('lock.later');
  }

  /** To the chapter map; after a win the map plays the level-open animation (not from the pause panel). */
  private toMap(): void {
    const data: ChapterMapData = { chapter: this.level.chapter, ...(this.ended && this.mapReveal ? { reveal: this.mapReveal } : {}) };
    this.scene.start('ChapterMapScene', data);
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
    this.ground.bake(w, h, [this.background, this.roads.graphics]);
    this.units.layout(this.layoutField);
    for (const node of nodes) this.nodeViews.get(node.id)!.place(node, this.layoutField);
    // Bottom-left, above the bottom bar: clear of the top bar and the goal plaque.
    this.fpsText?.setPosition(px(8), h - px(HUD.bottomBar + 22));
    this.hud.layout();
    this.tutorialView?.layout();
  }

  private render(alpha: number): void {
    const world = this.world;

    for (const node of Object.values(world.nodes)) {
      const view = this.nodeViews.get(node.id)!;
      if (view.sync(node, this.time.now) & SHOWN_OWNER_CHANGED) this.showCapture(view);
      view.setHighlight(this.highlightFor(node));
      if (node.released !== view.releasedSeen) {
        view.releasedSeen = node.released;
        // Only the player's own nodes (docs/FX.md, open question 1).
        if (this.sparks && node.owner === 'player') this.showRelease(view, node);
      }
      view.animate(this.time.now, this.fx);
    }

    this.units.render(world, this.layoutField, alpha);
    this.flashes.update(this.time.now);
    this.updateFps();

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

  /** Dev counter, refreshed twice a second (a Text redraw per frame would cost more than the units). */
  private updateFps(): void {
    if (!this.fpsText || this.time.now - this.fpsShownAt < 500) return;
    this.fpsShownAt = this.time.now;
    this.fpsText.setText(`FPS ${Math.round(this.game.loop.actualFps)} · units ${this.world.units.length}`);
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
        if (boss?.type === 'mage' && this.world.nodes[boss.towerId]?.owner === 'enemy') {
          const sec = Math.max(0, Math.ceil(((boss.strikeTick - this.world.tick) * TICK_MS) / 1000));
          this.hud.setGoal(t('boss.mage', { sec }));
        } else {
          this.hud.setGoal(t('goal.capital'));
        }
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
    // Mage warning: a pulsing red circle over the player's node that the next fireball will hit.
    if (boss?.type === 'mage' && boss.targetId) {
      const view = this.nodeViews.get(boss.targetId)!;
      const left = Math.max(0, (boss.strikeTick - this.world.tick) * TICK_MS) / MAGE.warnMs;
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 90);
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

  /** Badge with the troops that will leave, at the end of the swipe line. */
  private drawSendBadge(): void {
    const badge = this.sendBadge;
    const drag = this.drag;
    if (!drag?.moved) {
      badge.setVisible(false);
      return;
    }
    const hover = this.nodeAt(drag.x, drag.y);
    const end = hover ? this.nodeViews.get(hover.id)! : null;
    const count = hover
      ? previewAttack(this.world, 'player', drag.sources, 'swipe', hover.id).sent
      : drag.sources.reduce((sum, id) => sum + sendAmount(this.world.nodes[id]!.troops, 'swipe'), 0);
    if (count <= 0) {
      badge.setVisible(false);
      return;
    }
    const text = String(count);
    if (badge.text !== text) badge.setText(text);
    badge.setPosition(end ? end.x : drag.x, end ? end.y - end.radius * 1.34 - px(16) : drag.y - px(36)).setVisible(true);
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
        const cast = { type: 'cast', side: 'player', spell: this.armed, nodeId: node.id } as const;
        // On the lesson only the shown node takes the spell; the spell stays armed for it.
        if (!isCommandAllowed(this.tutorial, this.world, cast)) return this.refused();
        this.queue.push(cast);
      } else if (!isUiAllowed(this.tutorial, { type: 'spellSelect' })) {
        return this.refused();
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

    // Sends are swipe-only: a tap on a foreign node only closes the menu (and labels special nodes, GDD 3.12).
    if (this.menu && !this.ui({ type: 'deselect' })) return;
    this.deselect();
    if (node) this.showInfo(node);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || pointer.id !== drag.pointerId) return;
    drag.x = pointer.x;
    drag.y = pointer.y;
    if (!drag.moved && Math.hypot(pointer.x - drag.startX, pointer.y - drag.startY) > px(DRAG_THRESHOLD_PX)) {
      drag.moved = true;
      // A lesson's open build menu stays open (the swipe itself is refused on release).
      if (isUiAllowed(this.tutorial, { type: 'deselect' })) this.deselect();
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
      if (target) this.sendFrom(drag.sources, target.id);
      return;
    }

    // A tap on an own node opens its build menu; a second tap on the same node closes it.
    if (this.selected === drag.downNode) {
      if (this.ui({ type: 'deselect' })) this.deselect();
    } else if (this.ui({ type: 'select', node: drag.downNode })) {
      this.select(drag.downNode);
    }
  }

  /** Asks the lesson gate about a tap or button; a refused one nudges the hint. */
  private ui(event: GateUi): boolean {
    if (isUiAllowed(this.tutorial, event)) return true;
    this.refused();
    return false;
  }

  /** Something the lesson does not allow now: the hint jumps and the finger shows the gesture again (F-6). */
  private refused(): void {
    this.tutorialView?.nudge(this.time.now);
  }

  /** The player's only way to send troops: a swipe, 75% from every source (GDD 3.5). */
  private sendFrom(sources: readonly string[], target: string): void {
    const real = sources.filter((s) => s !== target);
    if (real.length === 0) return;
    if (!isSendAllowed(this.tutorial, this.world, real, target)) return this.refused();
    for (const from of sources) {
      if (from !== target) this.queue.push({ type: 'send', side: 'player', from, to: target, mode: 'swipe' });
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
    this.menu = new BuildMenu(
      this,
      this.world.nodes[nodeId]!,
      (choice) => this.onBuild(nodeId, choice),
      (type) => this.buildingLock(type),
    ).setDepth(90);
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
    const cmd: Command =
      choice.kind === 'build' ? { type: 'build', side: 'player', nodeId, building: choice.building } : { type: 'upgrade', side: 'player', nodeId };
    // On the lesson the other buttons don't work; the menu stays open for the right one.
    if (!isCommandAllowed(this.tutorial, this.world, cmd)) return this.refused();
    this.queue.push(cmd);
    this.deselect();
  }

  /**
   * A unit hit a node (docs/FX.md FX-2): the node squashes and flashes, its count jumps, an own node trembles; sparks
   * of the attacker's colors fly out of the rim towards the attacker, at most one burst per node every
   * SPARK_FX.hitEveryNodeMs.
   */
  private showHit(view: NodeView, attacker: Owner, rimX: number, rimY: number, outwards: number): void {
    const now = this.time.now;
    view.hit(now, view.shown.owner === 'player');
    if (now - view.lastSparksAt < SPARK_FX.hitEveryNodeMs) return;
    view.lastSparksAt = now;
    this.sparks!.burst(rimX, rimY, outwards, SPARK_FX.hit, SPARK_COLORS[attacker]);
  }

  /**
   * A unit left an own node (docs/FX.md FX-3): the node squashes and flashes, light sparks fly from the rim towards
   * the road the newest unit took. Several units in one frame show once (the impulses don't add up).
   */
  private showRelease(view: NodeView, node: NodeState): void {
    view.release(this.time.now);
    // The newest unit from this node: new units are at the end of world.units (swap-remove only moves old ones).
    const units = this.world.units;
    let to: NodeView | undefined;
    for (let i = units.length - 1; i >= 0 && i >= units.length - RELEASE_LOOKBACK; i--) {
      const route = units[i]!.route;
      if (route.path[0] === node.id) {
        to = this.nodeViews.get(route.path[1]!);
        break;
      }
    }
    if (!to) return;
    const angle = Math.atan2(to.y - view.y, to.x - view.x);
    const rimX = view.x + Math.cos(angle) * view.radius;
    const rimY = view.y + Math.sin(angle) * view.radius;
    this.sparks!.burst(rimX, rimY, angle, SPARK_FX.release, RELEASE_COLORS);
  }

  /** The node just showed a new owner (PLAYTEST-1 F-2): pop, burst, sound and vibration. */
  private showCapture(view: NodeView): void {
    const owner = view.shown.owner;
    const before = view.shown.previousOwner;
    pop(this, view);
    ringBurst(this, view.x, view.y, view.radius, COLORS.faction[owner]);
    if (owner === 'player') {
      playSfx('capture');
      this.vibrate(HAPTICS.short);
      if (isRival('player', before) && view.capital) this.shake();
    } else if (before === 'player') {
      playSfx('lost');
      this.vibrate(HAPTICS.short);
    }
  }

  /** Name and effect of a special node, above it for a few seconds. */
  private showInfo(node: NodeState): void {
    this.infoLabel?.destroy();
    this.infoLabel = null;
    if (node.kind === 'normal') return;
    const view = this.nodeViews.get(node.id)!;
    const label = hintLabel(this, `${t(`kind.${node.kind}`)}\n${t(`kind.${node.kind}.desc`)}`, 14).setDepth(95);
    // Above the node, inside the screen and below the top bar.
    const bottom = Math.max(view.y - view.radius * 1.5 - px(24), px(HUD.topBar) + label.height + px(4));
    label.setPosition(Math.min(Math.max(view.x, label.width / 2 + px(4)), this.scale.width - label.width / 2 - px(4)), bottom - label.height / 2);
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

  /**
   * The shared settings panel over the pause panel. No language row here: a new language would need the HUD
   * rebuilt mid-battle; the menu has it.
   */
  private openSettings(): void {
    if (this.settingsPanel) return;
    this.settingsPanel = new SettingsPanel(this, settingsModel(getStore(this)), {
      depth: SETTINGS_DEPTH,
      onClose: () => (this.settingsPanel = null),
    });
  }

  // ---- Speed-up ---------------------------------------------------------------------------------

  /**
   * The player is choosing: a tutorial step waits for them, the build menu is open, a swipe is being drawn,
   * or a spell is armed and waits for its target. The battle runs at SLOW_MO.speed meanwhile.
   */
  private isChoosing(): boolean {
    return isTutorialSlow(this.tutorial) || this.menu !== null || this.drag !== null || this.armed !== null;
  }

  /** The speed-up is offered only while the player holds more than SPEED_UP.unlockShare of all nodes. */
  private speedAvailable(): boolean {
    return ownedShare(this.world, 'player') > SPEED_UP.unlockShare;
  }

  private syncSpeed(): void {
    // No speed-up button during a lesson or while a tutorial step slows the battle down.
    const available = !this.ended && this.speedAvailable() && !gateLocked(this.tutorial) && !isTutorialSlow(this.tutorial);
    if (!available) this.speed = 1;
    this.hud.setSpeed(available, this.speed);
  }

  private toggleSpeed(): void {
    if (this.paused || this.ended || !this.speedAvailable()) return;
    this.speed = this.speed === 1 ? SPEED_UP.multiplier : 1;
  }

  private toggleSpell(spell: SpellId): void {
    if (this.paused || this.ended) return;
    if (!this.ui({ type: 'spellSelect' })) return;
    this.deselect();
    this.armed = this.armed === spell ? null : spell;
    if (this.armed) this.uiEvents.push({ type: 'spellSelect', spell });
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
      () => this.openSettings(),
    );
    setMusicDucked(true);
  }

  private resume(): void {
    this.paused = false;
    this.hud.hideOverlay();
    setMusicDucked(false);
    this.platform.gameplayStart();
  }

  /** Tab hidden: show the pause panel, so the player comes back to a paused battle. */
  private onHidden(): void {
    this.pause();
  }
}
