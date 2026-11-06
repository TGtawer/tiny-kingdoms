import * as Phaser from 'phaser';
import { BUTTON_STYLE, COLORS, MENU_FOCUS, MENU_FX, MENU_LAYOUT, type MenuBannerId } from '../config/game';
import { FEATURE_UNLOCKS } from '../config/balance';
import { isMenuFocus } from '../core/meta/menuFocus';
import { currentLevel } from '../core/meta/Progress';
import { isUpgradesOpen } from '../core/meta/unlocks';
import { t } from '../i18n/i18n';
import { ALL_LEVELS, FIRST_LEVEL, getLevel } from '../levels';
import { toast } from '../view/effects';
import { drawFinger, drawNote, drawOff, drawSpeaker } from '../view/icons';
import { px } from '../view/layout';
import { backOut, frameX, frameY, seg } from '../view/MenuBanner';
import { MENU_DEPTH, NightScreen, TournamentScreen, type MenuScreen } from '../view/menuScreens';
import { isMusicEnabled, playMusic, setMusicEnabled } from '../view/music';
import { ShinyTitle } from '../view/ShinyTitle';
import { isSoundEnabled, playSfx, setSoundEnabled } from '../view/sound';
import { crystalCounter } from '../view/ui';
import type { BattleSceneData } from './BattleScene';
import { getMenuFocusOverride, getStore } from './registry';

/**
 * Main menu (docs/VISUALS.md V-4): three banners that are the buttons — Map, Play (→ the next level right
 * away), Upgrades. Portrait shows «Tournament», landscape «Night castle». The title, the sound and music
 * toggles and the crystal counter are shared. The entrance plays on every visit, not on resize.
 * Focus mode on the first launch (PLAYTEST-1 F-1): Map dimmed and not pressable, a finger taps «Play».
 */
export class MenuScene extends Phaser.Scene {
  private screen: MenuScreen | null = null;
  private title: ShinyTitle | null = null;
  /** Toggles and crystals: rebuilt when a toggle flips. */
  private corner: Phaser.GameObjects.GameObject[] = [];
  /** Scene time when the entrance started, ms. */
  private enteredAt = 0;
  private leaving = false;
  /** Focus mode finger over the Play medallion (null outside the focus mode). */
  private finger: Phaser.GameObjects.Graphics | null = null;
  private readonly medal = { x: 0, y: 0, r: 0 };

  constructor() {
    super('MenuScene');
  }

  create(): void {
    playMusic('music_menu');
    this.leaving = false;
    this.build(true);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.screen?.destroy();
      this.title?.destroy();
      this.screen = null;
      this.title = null;
      this.finger = null;
      this.corner = [];
    });
  }

  override update(time: number, delta: number): void {
    const screen = this.screen;
    if (!screen) return;
    const sec = time / 1000;
    const e = (time - this.enteredAt) / 1000;
    screen.update(sec, delta / 1000, e);

    // Title: fades in and drops into place, then bobs.
    const E = MENU_FX.entrance;
    const ms = e * 1000;
    const T = screen.title;
    const bob = Math.sin(sec * MENU_FX.titleBobSpeed) * MENU_FX.titleBob * seg(ms, E.titleBobFromMs, E.titleBobFromMs + 300);
    const y = E.titleFrom + (T.y + bob - E.titleFrom) * backOut(seg(ms, 0, E.titleDropMs));
    this.title?.image.setPosition(frameX(screen.frame, T.x), frameY(screen.frame, y)).setAlpha(seg(ms, 0, E.titleFadeMs));
    if (MENU_FX.showShine) this.title?.update(time);

    if (this.finger) {
      // Taps the Play medallion, following its sway; fades in after the entrance.
      const F = MENU_FOCUS;
      const m = screen.medal('play', this.medal);
      const lift = (Math.cos((ms * Math.PI) / F.tapMs) + 1) / 2;
      this.finger
        .setPosition(m.x + m.r * F.fingerAt.x, m.y + m.r * F.fingerAt.y + px(F.tapLift) * lift)
        .setScale(0.9 + 0.1 * lift)
        .setAlpha(seg(ms, F.fingerFromMs, F.fingerFromMs + F.fingerFadeMs));
    }

    const corner = seg(ms, 0, E.cornerMs);
    for (const obj of this.corner) (obj as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(corner);
  }

  private onResize(): void {
    this.build(false);
  }

  private build(entrance: boolean): void {
    this.screen?.destroy();
    this.title?.destroy();
    this.finger?.destroy();
    this.finger = null;
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    // Without the entrance everything is in place at once.
    this.enteredAt = entrance ? this.time.now : this.time.now - 10_000;

    const progress = getStore(this).progress;
    // Play always starts the next level to win (on the first launch: level 1 with its tutorial).
    const level = currentLevel(progress, ALL_LEVELS) ?? FIRST_LEVEL;
    const focus = isMenuFocus(progress, MENU_FOCUS.firstLaunch, getMenuFocusOverride(this));
    const labels: Record<MenuBannerId, readonly string[]> = {
      map: [t('menu.map')],
      play: [t('menu.play'), t('menu.levelN', { index: level.index })],
      up: [t('menu.upgrades')],
    };
    const options = {
      labels,
      onPress: (id: MenuBannerId) => this.press(id, level.id),
      locked: { up: !isUpgradesOpen(progress) },
      dimmed: { map: focus },
    };
    this.screen = h > w ? new TournamentScreen(this, w, h, options) : new NightScreen(this, w, h, options);
    if (focus) {
      this.finger = this.add.graphics().setDepth(MENU_DEPTH.ui).setAlpha(0);
      drawFinger(this.finger, px(1));
    }

    const T = this.screen.title;
    const sizeCss = (T.size * this.screen.frame.s) / px(1);
    this.title = new ShinyTitle(this, t('game.title'), sizeCss, sizeCss * MENU_FX.titleStroke, sizeCss * MENU_FX.titleShadow);
    this.title.image.setDepth(MENU_DEPTH.title);
    this.buildCorner();
  }

  /** A banner was pressed: it swings and flashes, the scene changes a moment later. */
  private press(id: MenuBannerId, levelId: string): void {
    if (this.leaving) return;
    if (id === 'up' && !isUpgradesOpen(getStore(this).progress)) {
      // Locked until the first win on its level: the banner swings, a label says when it opens.
      playSfx('click');
      const afterIndex = getLevel(FEATURE_UNLOCKS.upgrades.afterWin)?.index ?? 0;
      toast(this, this.scale.width / 2, this.scale.height - px(24), t('lock.afterLevel', { index: afterIndex }), MENU_DEPTH.ui + 1);
      return;
    }
    this.leaving = true;
    playSfx('click');
    this.time.delayedCall(MENU_FX.press.leaveMs, () => {
      if (id === 'play') {
        const data: BattleSceneData = { levelId };
        this.scene.start('BattleScene', data);
      } else if (id === 'map') this.scene.start('ChapterMapScene');
      else this.scene.start('UpgradesScene', { from: 'MenuScene' });
    });
  }

  /** Crystals in the top-right corner, sound and music toggles in the top-left one. */
  private buildCorner(): void {
    for (const obj of this.corner) obj.destroy();
    const before = new Set(this.children.list);
    crystalCounter(this, this.scale.width - px(14), px(30), getStore(this).progress.crystals);
    this.settingsToggles();
    this.corner = this.children.list.filter((obj) => !before.has(obj));
    for (const obj of this.corner) (obj as unknown as Phaser.GameObjects.Components.Depth).setDepth(MENU_DEPTH.ui);
  }

  /** Sound and music on/off (the battle pause panel has the same toggles). */
  private settingsToggles(): void {
    const store = getStore(this);
    const L = MENU_LAYOUT;
    const r = px(L.toggleSize) / 2;
    const y = px(L.toggleMargin) + r;
    const toggles = [
      {
        on: isSoundEnabled(),
        icon: drawSpeaker,
        flip: () => {
          store.settings.sound = !store.settings.sound;
          setSoundEnabled(store.settings.sound);
        },
      },
      {
        on: isMusicEnabled(),
        icon: drawNote,
        flip: () => {
          store.settings.music = !store.settings.music;
          setMusicEnabled(store.settings.music);
        },
      },
    ];
    toggles.forEach((toggle, i) => {
      const x = px(L.toggleMargin) + r + i * (r * 2 + px(L.toggleGap));
      // Round version of the Button look: soft shadow, face, highlight on top, outline; the face sinks when pressed.
      const g = this.add.graphics();
      const draw = (pressed: boolean): void => {
        const B = BUTTON_STYLE;
        const dy = pressed ? px(B.pressDrop) : 0;
        g.clear();
        g.fillStyle(COLORS.outline, B.shadowAlpha).fillCircle(0, px(L.toggleShadow), r);
        g.fillStyle(pressed ? COLORS.buttonPressed : COLORS.button, 1).fillCircle(0, dy, r);
        g.fillStyle(0xffffff, B.shineAlpha).fillEllipse(0, dy - r * L.toggleShineY, r * L.toggleShineW * 2, r * L.toggleShineH * 2);
        g.lineStyle(px(B.outline), COLORS.outline, 1).strokeCircle(0, dy, r);
        toggle.icon(g, 0, dy - px(1), px(L.toggleIcon));
        if (!toggle.on) drawOff(g, 0, dy - px(1), px(L.toggleIcon));
      };
      draw(false);
      const hit = px(L.toggleHit);
      let pressed = false;
      const button = this.add.container(x, y, [g]).setSize(hit, hit);
      button.setInteractive(new Phaser.Geom.Circle(hit / 2, hit / 2, hit / 2), Phaser.Geom.Circle.Contains);
      button.input!.cursor = 'pointer';
      button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        pressed = true;
        draw(true);
      });
      button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
        pressed = false;
        draw(false);
      });
      button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (!pressed) return;
        playSfx('click');
        toggle.flip();
        store.commit();
        this.buildCorner();
      });
    });
  }
}
