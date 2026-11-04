import * as Phaser from 'phaser';
import { COLORS, DRAG_THRESHOLD_PX, HUD, MAP, MAP_FX } from '../config/game';
import { mapTrack } from '../core/audio/playlist';
import type { LevelData } from '../core/level/schema';
import { currentLevel, isCompleted, isUnlocked } from '../core/meta/Progress';
import { bestStars } from '../core/meta/stars';
import { t } from '../i18n/i18n';
import { ALL_LEVELS, CHAPTERS } from '../levels';
import { ringBurst, sparks } from '../view/effects';
import { drawCheck, drawLock, drawLockHalf, drawStar } from '../view/icons';
import { clamp, px, textStyle, type Point } from '../view/layout';
import { MAP_DEPTH, MapScenery } from '../view/MapScenery';
import { audioFiles, playMusic } from '../view/music';
import { playSfx } from '../view/sound';
import { drawMeadow, textButton, topBar } from '../view/ui';
import { getStore } from './registry';

/** A won battle to show on the map (docs/VISUALS.md V-3). Progress is already saved; this is only the picture. */
export interface MapReveal {
  levelId: string;
  /** Stars of this win, and the best before it. */
  stars: number;
  previousStars: number;
  /** First win of the level: the next one opens (road, lock, token). Otherwise only the new stars. */
  unlocked: boolean;
}

export interface ChapterMapData {
  chapter?: number;
  reveal?: MapReveal;
}

/** How a level node looks. */
interface NodeLook {
  open: boolean;
  done: boolean;
  /** The level to play next: gold. */
  current: boolean;
  stars: number;
  /** Tappable even while it still looks locked (the level the animation is opening). */
  forceTap?: boolean;
}

interface NodeParts {
  container: Phaser.GameObjects.Container;
  check: Phaser.GameObjects.Graphics | null;
  stars: Phaser.GameObjects.Graphics[];
  lock: Phaser.GameObjects.Graphics | null;
}

/**
 * Chapter map (GDD 4.1): a winding path of level nodes; levels open strictly in order.
 * Nodes keep a fixed size and spacing; when the path does not fit, the map scrolls
 * (vertically in portrait, horizontally in landscape). Top bar and bottom button stay in place.
 * Around the path lives the scenery of docs/VISUALS.md V-2 (MapScenery); after a win the map
 * plays the level-open animation of V-3.
 */
export class ChapterMapScene extends Phaser.Scene {
  private chapter = 1;
  private pulse: Phaser.Tweens.Tween | null = null;
  private scenery: MapScenery | null = null;
  private portrait = true;
  /** Pointer travel since press, to tell a tap on a level from a scroll. */
  private drag: { id: number; last: number; travelled: number } | null = null;
  private levels: readonly LevelData[] = [];
  private points: Point[] = [];
  private readonly nodes = new Map<string, NodeParts>();
  private nodeRadius = 0;
  private world = { width: 0, height: 0 };
  /** Set by the battle; the map is first laid out as before the win, then animated. */
  private reveal: MapReveal | null = null;
  /** The running animation: its start and the levels involved (`next` null: no level to open). */
  private anim: { t0: number; won: number; next: number | null } | null = null;

  constructor() {
    super('ChapterMapScene');
  }

  init(data: ChapterMapData): void {
    const store = getStore(this);
    // Default: the chapter of the level to play next.
    this.chapter = data.chapter ?? currentLevel(store.progress, ALL_LEVELS)?.chapter ?? 1;
    this.drag = null;
    const reveal = data.reveal ?? null;
    const levels = CHAPTERS[this.chapter - 1] ?? [];
    const worthShowing = reveal !== null && (reveal.unlocked || reveal.stars > reveal.previousStars);
    this.reveal = worthShowing && levels.some((l) => l.id === reveal.levelId) ? reveal : null;
    this.anim = null;
  }

  create(): void {
    // Same track as the upgrades screen: map ↔ upgrades keeps playing from the same place.
    playMusic(mapTrack(audioFiles()));
    this.build();
    if (this.reveal) this.startReveal(this.reveal);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.scenery = null;
      this.nodes.clear();
    });
  }

  override update(time: number, delta: number): void {
    this.scenery?.update(time, delta);
    if (this.anim) this.animate(time);
  }

  private get animating(): boolean {
    return this.anim !== null;
  }

  /** A resize mid-animation skips to the end: the map is laid out again in its final state. */
  private onResize(): void {
    if (this.reveal || this.anim) {
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.reveal = null;
      this.anim = null;
    }
    this.build();
  }

  private build(): void {
    this.pulse?.stop();
    this.pulse = null;
    this.children.removeAll(true);
    this.nodes.clear();
    const w = this.scale.width;
    const h = this.scale.height;
    const cam = this.cameras.main;
    cam.setSize(w, h);
    this.portrait = h > w;

    drawMeadow(this.add.graphics().setScrollFactor(0).setDepth(MAP_DEPTH.meadow), w, h);

    const progress = getStore(this).progress;
    const levels = CHAPTERS[this.chapter - 1] ?? [];
    this.levels = levels;
    const barH = px(HUD.topBar);
    const bottomH = px(HUD.bottomBar);
    const spacing = px(MAP.spacing);
    const margin = px(MAP.margin);
    const r = px(MAP.nodeRadius);
    this.nodeRadius = r;
    const pathLength = Math.max(0, levels.length - 1) * spacing;

    // Layout in world coordinates. The main axis grows with the number of levels; the camera scrolls along it.
    const points: Point[] = [];
    let worldW = w;
    let worldH = h;
    if (this.portrait) {
      const visible = h - barH - bottomH;
      worldH = Math.max(h, barH + bottomH + pathLength + 2 * margin);
      // Short paths are centered in the visible band; long ones start at the bottom of the world.
      const startY = pathLength + 2 * margin <= visible ? barH + visible / 2 + pathLength / 2 : worldH - bottomH - margin;
      const amp = Math.min(w / 2 - r - px(16), px(MAP.amplitude));
      levels.forEach((_, i) => points.push({ x: w / 2 + amp * wave(i), y: startY - i * spacing }));
    } else {
      const visible = w;
      worldW = Math.max(w, pathLength + 2 * margin);
      const startX = pathLength + 2 * margin <= visible ? w / 2 - pathLength / 2 : margin;
      const midY = barH + (h - barH - bottomH) / 2;
      const amp = Math.min((h - barH - bottomH) / 2 - r - px(12), px(MAP.amplitude));
      levels.forEach((_, i) => points.push({ x: startX + i * spacing, y: midY + amp * wave(i) }));
    }
    this.points = points;
    this.world = { width: worldW, height: worldH };
    cam.setBounds(0, 0, worldW, worldH);

    // With a pending level-open animation the map starts as it was before the win.
    const reveal = this.reveal;
    const opening = reveal?.unlocked ? reveal.levelId : null;
    const doneBefore = (id: string): boolean => isCompleted(progress, id) && id !== opening;
    const starsBefore = (id: string): number =>
      reveal && id === reveal.levelId ? (reveal.unlocked ? 0 : reveal.previousStars) : bestStars(progress, id);
    const done = levels.filter((l) => doneBefore(l.id)).length;

    this.scenery = new MapScenery(this, {
      chapter: this.chapter,
      points,
      done,
      nodeRadius: r,
      world: { width: worldW, height: worldH },
      portrait: this.portrait,
      band: { top: barH, bottom: h - bottomH },
    });

    const next = opening ? (levels.find((l) => l.id === opening) ?? null) : currentLevel(progress, ALL_LEVELS);
    const openingIndex = opening ? levels.findIndex((l) => l.id === opening) : -1;
    levels.forEach((level, i) => {
      const isDone = doneBefore(level.id);
      const open = opening ? isDone || level.id === opening : isUnlocked(progress, ALL_LEVELS, level.id);
      this.placeNode(level, i, {
        open,
        done: isDone,
        current: next?.id === level.id,
        stars: starsBefore(level.id),
        // The level being opened can be started right away (the animation must not hold the player up).
        forceTap: openingIndex >= 0 && i === openingIndex + 1,
      });
    });
    // While a level is being opened, the pulse waits for the end of the animation.
    if (next && !opening) this.startPulse(next.id);

    // Fixed UI on top of the scrolling map.
    const uiStart = this.children.list.length;
    topBar(this, t('map.chapter', { chapter: this.chapter }), progress.crystals, () => this.scene.start('MenuScene'));
    const strip = this.add.graphics();
    strip.fillStyle(COLORS.outline, 0.28).fillRect(0, h - bottomH, w, bottomH);
    textButton(this, w / 2, h - bottomH / 2, Math.min(w - px(48), px(260)), px(56), t('menu.upgrades'), () =>
      this.scene.start('UpgradesScene', { from: 'ChapterMapScene' }),
    );
    for (const obj of this.children.list.slice(uiStart)) {
      const o = obj as Phaser.GameObjects.GameObject & Partial<Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>;
      if (o instanceof Phaser.GameObjects.Container) o.setScrollFactor(0, 0, true);
      else o.setScrollFactor?.(0);
      o.setDepth?.(100);
    }

    // Start with the next level in view.
    const focus = next && levels.includes(next) ? points[levels.indexOf(next)]! : points[0];
    if (focus) cam.setScroll(...this.scrollFor(focus));
  }

  /** Camera scroll that puts `p` in the middle of the visible band, within the world. */
  private scrollFor(p: Point): [number, number] {
    const w = this.scale.width;
    const h = this.scale.height;
    if (this.portrait) {
      const barH = px(HUD.topBar);
      const band = h - barH - px(HUD.bottomBar);
      return [0, clamp(p.y - (barH + band / 2), 0, Math.max(0, this.world.height - h))];
    }
    return [clamp(p.x - w / 2, 0, Math.max(0, this.world.width - w)), 0];
  }

  private startPulse(levelId: string): void {
    const node = this.nodes.get(levelId);
    if (!node) return;
    this.pulse?.stop();
    this.pulse = this.tweens.add({ targets: node.container, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  /** Creates (or re-creates) the node of level `i` in the given look. */
  private placeNode(level: LevelData, i: number, look: NodeLook): NodeParts {
    const old = this.nodes.get(level.id);
    if (old) {
      this.tweens.killTweensOf(old.container);
      old.container.destroy();
    }
    const p = this.points[i]!;
    const r = this.nodeRadius;
    const container = this.add.container(p.x, p.y);
    const g = this.add.graphics();
    const owner = look.open ? 'player' : 'neutral';
    g.fillStyle(0x000000, 0.18).fillEllipse(0, r * 0.82, r * 1.9, r * 0.6);
    // Rim exactly under the outline; the face sits a bit higher inside it, so the rim shows as a lip below.
    g.fillStyle(look.current ? COLORS.goldDark : COLORS.factionDark[owner], 1).fillCircle(0, 0, r);
    g.fillStyle(look.current ? COLORS.gold : COLORS.faction[owner], 1).fillCircle(0, -r * MAP.nodeLip, r * (1 - MAP.nodeLip));
    g.lineStyle(Math.max(2, r * 0.09), COLORS.outline, 1).strokeCircle(0, 0, r);
    // Glossy highlight, as on the battle nodes.
    g.fillStyle(0xffffff, MAP.nodeShineAlpha).fillEllipse(-r * 0.3, -r * 0.45, r * 0.8, r * 0.38);
    container.add(g);

    let lock: Phaser.GameObjects.Graphics | null = null;
    if (look.open) {
      container.add(this.add.text(0, 0, String(level.index), textStyle(MAP.nodeRadius * 0.8)).setOrigin(0.5).setStroke('#1f2937', px(5)));
    } else {
      lock = this.add.graphics();
      drawLock(lock, 0, 0, r * 0.9);
      container.add(lock);
    }
    let check: Phaser.GameObjects.Graphics | null = null;
    const stars: Phaser.GameObjects.Graphics[] = [];
    if (look.done) {
      check = this.add.graphics({ x: r * 0.7, y: -r * 0.7 });
      drawCheck(check, 0, 0, r * 0.6);
      container.add(check);
      // Best star rating under the node.
      const size = px(MAP.starSize);
      // One Graphics per star: in a shared one Phaser strokes earlier outlines again, so stars 2 and 3 looked bolder.
      for (let k = 0; k < 3; k++) {
        const star = this.add.graphics({ x: (k - 1) * size * 1.05, y: r + size * 0.55 });
        drawStar(star, 0, 0, size, k < look.stars);
        container.add(star);
        stars.push(star);
      }
    }

    if (look.open || look.forceTap) {
      container.setSize(r * 2.2, r * 2.2);
      container.setInteractive(new Phaser.Geom.Circle(r * 1.1, r * 1.1, r * 1.1), Phaser.Geom.Circle.Contains);
      container.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        // A press that turned into a scroll is not a tap.
        if (this.drag && this.drag.travelled > px(DRAG_THRESHOLD_PX)) return;
        this.scene.start('BattleScene', { levelId: level.id });
      });
    }
    const parts = { container, check, stars, lock };
    this.nodes.set(level.id, parts);
    return parts;
  }

  // ---- Level-open animation (V-3) ------------------------------------------------------------------

  private startReveal(reveal: MapReveal): void {
    const A = MAP_FX.reveal;
    const won = this.levels.findIndex((l) => l.id === reveal.levelId);
    const wonLevel = this.levels[won];
    if (!wonLevel) return;
    // The level this win opens (none after the last level of the chapter: no road and no lock).
    const next = reveal.unlocked && won + 1 < this.levels.length ? won + 1 : null;
    this.anim = { t0: this.time.now, won, next };
    if (reveal.unlocked) this.scenery?.setQuiet(true);

    // 0 s: the level turns blue (a replay just pops), the check and the stars grow in, sparks on earned stars.
    const firstStar = reveal.unlocked ? 0 : reveal.previousStars;
    const node = this.placeNode(wonLevel, won, { open: true, done: true, current: false, stars: reveal.stars });
    this.tweens.add({ targets: node.container, scale: A.popScale, duration: A.popMs / 2, yoyo: true, ease: 'Quad.Out' });
    ringBurst(this, node.container.x, node.container.y, this.nodeRadius, COLORS.faction.player);
    if (reveal.unlocked && node.check) {
      node.check.setScale(0);
      this.tweens.add({ targets: node.check, scale: 1, duration: A.checkMs, delay: A.checkDelayMs, ease: 'Back.Out' });
    }
    node.stars.forEach((star, k) => {
      if (k < firstStar) return;
      const delay = A.starDelaysMs[k - firstStar] ?? 0;
      star.setScale(0);
      this.tweens.add({ targets: star, scale: 1, duration: A.starMs, delay, ease: 'Back.Out' });
      if (k >= reveal.stars) return;
      this.time.delayedCall(delay, () => {
        const S = A.starSparks;
        sparks(this, node.container.x + star.x, node.container.y + star.y, COLORS.gold, S.count, px(S.distance), S.ms, px(S.size));
        // TODO(audio): a short "ding" per star once docs/AUDIO.md has the file.
        playSfx('build');
      });
    });

    if (next === null) {
      const lastStar = (A.starDelaysMs[Math.max(0, 2 - firstStar)] ?? 0) + A.starMs;
      this.time.delayedCall(Math.max(A.checkDelayMs + A.checkMs, lastStar), () => this.finishReveal());
      return;
    }

    // 0.9–2.3 s: the camera brings the next level to the middle of the view.
    const [sx, sy] = this.scrollFor(this.points[next]!);
    this.tweens.add({ targets: this.cameras.main, scrollX: sx, scrollY: sy, delay: A.cameraStartMs, duration: A.cameraMs, ease: 'Sine.InOut' });
    // 2.4 s: the lock breaks and the level opens; 3.5 s: back to the normal map.
    this.time.delayedCall(A.breakAtMs, () => this.breakLock(next));
    this.time.delayedCall(A.endMs, () => this.finishReveal());
  }

  /** Per-frame parts of the animation: the road being drawn, the lock shaking, the token hopping over. */
  private animate(time: number): void {
    const anim = this.anim!;
    if (anim.next === null) return;
    const A = MAP_FX.reveal;
    const a = time - anim.t0;
    const road = clamp((a - A.roadStartMs) / A.roadMs, 0, 1);
    this.scenery?.revealRoad(anim.won, Phaser.Math.Easing.Sine.InOut(road));

    const lock = this.nodes.get(this.levels[anim.next]!.id)?.lock;
    if (lock && a >= A.shakeStartMs && a < A.breakAtMs) {
      const ramp = clamp((a - A.shakeStartMs) / A.shakeRampMs, 0, 1);
      lock.x = Math.sin((a / 1000) * A.shakeSpeed) * px(A.shakePx) * ramp;
    }
    if (a >= A.hopStartMs) {
      const k = clamp((a - A.hopStartMs) / A.hopMs, 0, 1);
      this.scenery?.moveToken(anim.won, anim.next, k, A.hops, A.hopHeight);
    }
  }

  private breakLock(next: number): void {
    const A = MAP_FX.reveal;
    const level = this.levels[next]!;
    const p = this.points[next]!;
    const r = this.nodeRadius;
    // Two halves of the lock fly apart along arcs, spinning, and fade.
    for (const side of [-1, 1] as const) {
      const half = this.add.graphics({ x: p.x, y: p.y }).setDepth(5);
      drawLockHalf(half, 0, 0, r * 0.9, side);
      const state = { k: 0 };
      this.tweens.add({
        targets: state,
        k: 1,
        duration: A.breakMs,
        onUpdate: () => {
          const k = state.k;
          half.setPosition(p.x + side * px(A.halfDx) * k, p.y - px(A.halfUp) * Math.sin(k * Math.PI) + px(A.halfDrop) * k * k);
          half.setRotation(side * k * A.halfSpin).setAlpha(1 - k);
        },
        onComplete: () => half.destroy(),
      });
    }
    // The level becomes the current one: gold, with its number, growing from nothing.
    const node = this.placeNode(level, next, { open: true, done: false, current: true, stars: 0 });
    node.container.setScale(0);
    this.tweens.add({ targets: node.container, scale: 1, duration: A.growMs, ease: 'Back.Out' });
    ringBurst(this, p.x, p.y, r, COLORS.gold);
    const S = A.starSparks;
    sparks(this, p.x, p.y, COLORS.gold, A.openSparks, px(S.distance) * 1.4, S.ms, px(S.size));
    // TODO(audio): a lock-break sound once docs/AUDIO.md has the file.
    playSfx('capture');
  }

  /** Back to the normal map: road, dashes, token and walker in the new state, the pulse, scrolling. */
  private finishReveal(): void {
    if (!this.anim) return;
    this.anim = null;
    this.reveal = null;
    const progress = getStore(this).progress;
    this.scenery?.setDone(this.levels.filter((l) => isCompleted(progress, l.id)).length);
    this.scenery?.setQuiet(false);
    const current = currentLevel(progress, ALL_LEVELS);
    if (current) this.startPulse(current.id);
  }

  // ---- Scrolling --------------------------------------------------------------------------------

  private axis(pointer: Phaser.Input.Pointer): number {
    return this.portrait ? pointer.y : pointer.x;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!this.drag) this.drag = { id: pointer.id, last: this.axis(pointer), travelled: 0 };
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || drag.id !== pointer.id || !pointer.isDown) return;
    const pos = this.axis(pointer);
    const delta = pos - drag.last;
    drag.last = pos;
    drag.travelled += Math.abs(delta);
    // The camera belongs to the level-open animation meanwhile.
    if (!this.animating) this.scrollBy(-delta);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    // Cleared after the game-object handlers of this release have run.
    if (this.drag?.id === pointer.id) this.time.delayedCall(0, () => (this.drag = null));
  }

  private onWheel(_p: Phaser.Input.Pointer, _over: unknown, dx: number, dy: number): void {
    if (this.animating) return;
    this.scrollBy(this.portrait ? dy : dx || dy);
  }

  private scrollBy(amount: number): void {
    const cam = this.cameras.main;
    const b = cam.getBounds();
    if (this.portrait) cam.scrollY = clamp(cam.scrollY + amount, b.y, b.y + b.height - cam.height);
    else cam.scrollX = clamp(cam.scrollX + amount, b.x, b.x + b.width - cam.width);
  }
}

/** Side-to-side offset of level i along the path, -1..1. */
function wave(i: number): number {
  return Math.sin(i * MAP.waveStep);
}
