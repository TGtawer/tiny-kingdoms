import * as Phaser from 'phaser';
import { COLORS, DRAG_THRESHOLD_PX, HUD, MAP } from '../config/game';
import { currentLevel, isCompleted, isUnlocked } from '../core/meta/Progress';
import { bestStars } from '../core/meta/stars';
import type { LevelData } from '../core/level/schema';
import { t } from '../i18n/i18n';
import { ALL_LEVELS, CHAPTERS } from '../levels';
import { drawCheck, drawLock, drawStar } from '../view/icons';
import { clamp, px, textStyle, type Point } from '../view/layout';
import { mapTrack } from '../core/audio/playlist';
import { audioFiles, playMusic } from '../view/music';
import { drawMeadow, textButton, topBar } from '../view/ui';
import { getStore } from './registry';

export interface ChapterMapData {
  chapter?: number;
}

/**
 * Chapter map (GDD 4.1): a winding path of level nodes; levels open strictly in order.
 * Nodes keep a fixed size and spacing; when the path does not fit, the map scrolls
 * (vertically in portrait, horizontally in landscape). Top bar and bottom button stay in place.
 */
export class ChapterMapScene extends Phaser.Scene {
  private chapter = 1;
  private pulse: Phaser.Tweens.Tween | null = null;
  private portrait = true;
  /** Pointer travel since press, to tell a tap on a level from a scroll. */
  private drag: { id: number; last: number; travelled: number } | null = null;

  constructor() {
    super('ChapterMapScene');
  }

  init(data: ChapterMapData): void {
    const store = getStore(this);
    // Default: the chapter of the level to play next.
    this.chapter = data.chapter ?? currentLevel(store.progress, ALL_LEVELS)?.chapter ?? 1;
    this.drag = null;
  }

  create(): void {
    // Same track as the upgrades screen: map ↔ upgrades keeps playing from the same place.
    playMusic(mapTrack(audioFiles()));
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this));
  }

  private build(): void {
    this.pulse?.stop();
    this.children.removeAll(true);
    const w = this.scale.width;
    const h = this.scale.height;
    const cam = this.cameras.main;
    cam.setSize(w, h);
    this.portrait = h > w;

    drawMeadow(this.add.graphics().setScrollFactor(0).setDepth(-10), w, h);

    const progress = getStore(this).progress;
    const levels = CHAPTERS[this.chapter - 1] ?? [];
    const barH = px(HUD.topBar);
    const bottomH = px(HUD.bottomBar);
    const spacing = px(MAP.spacing);
    const margin = px(MAP.margin);
    const r = px(MAP.nodeRadius);
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
    cam.setBounds(0, 0, worldW, worldH);

    // Road through all levels.
    const road = this.add.graphics();
    road.lineStyle(px(18), COLORS.roadEdge, 1);
    strokePath(road, points);
    road.lineStyle(px(11), COLORS.road, 1);
    strokePath(road, points);

    const next = currentLevel(progress, ALL_LEVELS);
    levels.forEach((level, i) => this.levelNode(level, points[i]!, r, next?.id === level.id));

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
    if (focus) cam.centerOn(focus.x, focus.y);
  }

  private levelNode(level: LevelData, p: Point, r: number, isNext: boolean): void {
    const progress = getStore(this).progress;
    const done = isCompleted(progress, level.id);
    const open = isUnlocked(progress, ALL_LEVELS, level.id);
    const owner = open ? 'player' : 'neutral';

    const container = this.add.container(p.x, p.y);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18).fillEllipse(0, r * 0.82, r * 1.9, r * 0.6);
    g.fillStyle(isNext ? COLORS.goldDark : COLORS.factionDark[owner], 1).fillCircle(0, r * 0.1, r);
    g.fillStyle(isNext ? COLORS.gold : COLORS.faction[owner], 1).fillCircle(0, 0, r * 0.92);
    g.lineStyle(Math.max(2, r * 0.09), COLORS.outline, 1).strokeCircle(0, 0, r);
    container.add(g);

    if (open) {
      container.add(this.add.text(0, 0, String(level.index), textStyle(MAP.nodeRadius * 0.8)).setOrigin(0.5).setStroke('#1f2937', px(5)));
    } else {
      const lock = this.add.graphics();
      drawLock(lock, 0, 0, r * 0.9);
      container.add(lock);
    }
    if (done) {
      const check = this.add.graphics();
      drawCheck(check, r * 0.7, -r * 0.7, r * 0.6);
      container.add(check);
      // Best star rating under the node.
      const stars = bestStars(progress, level.id);
      const size = px(MAP.starSize);
      // One Graphics per star: in a shared one Phaser strokes earlier outlines again, so stars 2 and 3 looked bolder.
      for (let i = 0; i < 3; i++) {
        const star = this.add.graphics();
        drawStar(star, (i - 1) * size * 1.05, r + size * 0.55, size, i < stars);
        container.add(star);
      }
    }

    if (isNext) {
      this.pulse = this.tweens.add({ targets: container, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }

    if (open) {
      container.setSize(r * 2.2, r * 2.2);
      container.setInteractive(new Phaser.Geom.Circle(r * 1.1, r * 1.1, r * 1.1), Phaser.Geom.Circle.Contains);
      container.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        // A press that turned into a scroll is not a tap.
        if (this.drag && this.drag.travelled > px(DRAG_THRESHOLD_PX)) return;
        this.scene.start('BattleScene', { levelId: level.id });
      });
    }
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
    this.scrollBy(-delta);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    // Cleared after the game-object handlers of this release have run.
    if (this.drag?.id === pointer.id) this.time.delayedCall(0, () => (this.drag = null));
  }

  private onWheel(_p: Phaser.Input.Pointer, _over: unknown, dx: number, dy: number): void {
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

function strokePath(g: Phaser.GameObjects.Graphics, pts: readonly Point[]): void {
  if (pts.length < 2) return;
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
  g.strokePath();
}
