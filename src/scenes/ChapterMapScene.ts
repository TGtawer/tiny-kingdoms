import * as Phaser from 'phaser';
import { COLORS, HUD, MIN_TOUCH_PX } from '../config/game';
import { currentLevel, isCompleted, isUnlocked } from '../core/meta/Progress';
import type { LevelData } from '../core/level/schema';
import { t } from '../i18n/i18n';
import { ALL_LEVELS, CHAPTERS } from '../levels';
import { drawCheck, drawLock } from '../view/icons';
import { px, textStyle, type Point } from '../view/layout';
import { drawMeadow, textButton, topBar } from '../view/ui';
import { getStore } from './registry';

export interface ChapterMapData {
  chapter?: number;
}

/** Chapter map (GDD 4.1): a winding path of level nodes; levels open strictly in order. */
export class ChapterMapScene extends Phaser.Scene {
  private chapter = 1;
  private pulse: Phaser.Tweens.Tween | null = null;

  constructor() {
    super('ChapterMapScene');
  }

  init(data: ChapterMapData): void {
    const store = getStore(this);
    // Default: the chapter of the level to play next.
    this.chapter = data.chapter ?? currentLevel(store.progress, ALL_LEVELS)?.chapter ?? 1;
  }

  create(): void {
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this));
  }

  private build(): void {
    this.pulse?.stop();
    this.children.removeAll(true);
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    drawMeadow(this.add.graphics(), w, h);

    const progress = getStore(this).progress;
    const barH = topBar(this, t('map.chapter', { chapter: this.chapter }), progress.crystals, () =>
      this.scene.start('MenuScene'),
    );

    const levels = CHAPTERS[this.chapter - 1] ?? [];
    const bottomH = px(HUD.bottomBar);
    const area = { x: px(16), y: barH + px(16), width: w - px(32), height: h - barH - bottomH - px(32) };
    const points = pathPoints(levels.length, area);

    // Road through all levels.
    const road = this.add.graphics();
    road.lineStyle(px(16), COLORS.roadEdge, 1);
    strokePath(road, points);
    road.lineStyle(px(10), COLORS.road, 1);
    strokePath(road, points);

    const radius = Math.max(px(MIN_TOUCH_PX / 2) + px(4), Math.min(px(34), Math.min(area.width, area.height) * 0.07));
    const next = currentLevel(progress, ALL_LEVELS);
    levels.forEach((level, i) => this.levelNode(level, points[i]!, radius, next?.id === level.id));

    textButton(this, w / 2, h - bottomH / 2, Math.min(w - px(48), px(260)), px(56), t('menu.upgrades'), () =>
      this.scene.start('UpgradesScene', { from: 'ChapterMapScene' }),
    );
  }

  private levelNode(level: LevelData, p: Point, r: number, isNext: boolean): void {
    const progress = getStore(this).progress;
    const done = isCompleted(progress, level.id);
    const open = isUnlocked(progress, ALL_LEVELS, level.id);
    const owner = done ? 'player' : open ? 'player' : 'neutral';

    const container = this.add.container(p.x, p.y);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18).fillEllipse(0, r * 0.82, r * 1.9, r * 0.6);
    g.fillStyle(isNext ? COLORS.goldDark : COLORS.factionDark[owner], 1).fillCircle(0, r * 0.1, r);
    g.fillStyle(isNext ? COLORS.gold : COLORS.faction[owner], 1).fillCircle(0, 0, r * 0.92);
    g.lineStyle(Math.max(2, r * 0.09), COLORS.outline, 1).strokeCircle(0, 0, r);
    container.add(g);

    if (open) {
      container.add(this.add.text(0, 0, String(level.index), textStyle(Math.round(r / px(1)) * 0.8)).setOrigin(0.5).setStroke('#1f2937', px(5)));
    } else {
      const lock = this.add.graphics();
      drawLock(lock, 0, 0, r * 0.9);
      container.add(lock);
    }
    if (done) {
      const check = this.add.graphics();
      drawCheck(check, r * 0.7, -r * 0.7, r * 0.6);
      container.add(check);
    }

    if (isNext) {
      this.pulse = this.tweens.add({ targets: container, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }

    if (open) {
      container.setSize(r * 2.2, r * 2.2);
      container.setInteractive(new Phaser.Geom.Circle(r * 1.1, r * 1.1, r * 1.1), Phaser.Geom.Circle.Contains);
      container.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.scene.start('BattleScene', { levelId: level.id }));
    }
  }
}

/** Winding path from bottom to top in portrait, left to right in landscape. */
function pathPoints(count: number, area: { x: number; y: number; width: number; height: number }): Point[] {
  const portrait = area.height > area.width;
  const pts: Point[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const wave = Math.sin(t * Math.PI * 3);
    if (portrait) {
      pts.push({ x: area.x + area.width * (0.5 + 0.32 * wave), y: area.y + area.height * (0.94 - 0.88 * t) });
    } else {
      pts.push({ x: area.x + area.width * (0.06 + 0.88 * t), y: area.y + area.height * (0.5 + 0.3 * wave) });
    }
  }
  return pts;
}

function strokePath(g: Phaser.GameObjects.Graphics, pts: readonly Point[]): void {
  if (pts.length < 2) return;
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
  g.strokePath();
}
