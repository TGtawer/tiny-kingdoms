import * as Phaser from 'phaser';
import { COLORS, BUTTON_STYLE, MENU_FX, MENU_LAYOUT } from '../config/game';
import { currentLevel } from '../core/meta/Progress';
import { t } from '../i18n/i18n';
import { ALL_LEVELS, FIRST_LEVEL } from '../levels';
import { drawNote, drawOff, drawSpeaker } from '../view/icons';
import { px } from '../view/layout';
import { MenuAmbient } from '../view/MenuAmbient';
import { MenuBackdrop } from '../view/MenuBackdrop';
import { isMusicEnabled, playMusic, setMusicEnabled } from '../view/music';
import { ShinyTitle } from '../view/ShinyTitle';
import { isSoundEnabled, playSfx, setSoundEnabled } from '../view/sound';
import { crystalCounter, drawFlowers, drawMeadow, textButton } from '../view/ui';
import type { BattleSceneData } from './BattleScene';
import { getStore } from './registry';

/** Draw order of the menu layers. */
const DEPTH = { meadow: -1, battle: 0, veil: 5, ambient: 6, ui: 10 } as const;

/**
 * Main menu (docs/VISUALS.md V-1): a flowery meadow with an AI-vs-AI battle under a veil, drifting cloud
 * shadows and birds; on top the title, Play (→ the next level right away), Map, Upgrades, sound and music
 * toggles. The UI plays an entrance animation on every visit (not on resize).
 */
export class MenuScene extends Phaser.Scene {
  private meadow!: Phaser.GameObjects.Graphics;
  private veil: Phaser.GameObjects.Rectangle | null = null;
  private backdrop: MenuBackdrop | null = null;
  private ambient: MenuAmbient | null = null;
  private title: ShinyTitle | null = null;
  /** Everything of the menu UI layer, rebuilt on resize. */
  private ui: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('MenuScene');
  }

  create(): void {
    playMusic('music_menu');
    this.meadow = this.add.graphics().setDepth(DEPTH.meadow);
    this.backdrop = MENU_FX.showBattle ? new MenuBackdrop(this, DEPTH.battle) : null;
    this.veil = MENU_FX.showBattle && MENU_FX.showVeil ? this.add.rectangle(0, 0, 1, 1, COLORS.background, MENU_FX.veilAlpha) : null;
    this.veil?.setOrigin(0, 0).setDepth(DEPTH.veil);
    this.ambient = new MenuAmbient(this, DEPTH.ambient);

    this.build(MENU_FX.showEntrance);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.backdrop?.destroy();
      this.ambient?.destroy();
      this.title?.destroy();
      this.backdrop = null;
      this.ambient = null;
      this.title = null;
      this.ui = [];
    });
  }

  override update(time: number, delta: number): void {
    this.backdrop?.update(delta);
    this.ambient?.update(time, delta);
    if (MENU_FX.showShine) this.title?.update(time);
  }

  private onResize(): void {
    this.build(false);
  }

  private build(entrance: boolean): void {
    for (const obj of this.ui) {
      this.tweens.killTweensOf(obj);
      obj.destroy();
    }
    this.title?.destroy();
    this.title = null;

    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    this.meadow.clear();
    drawMeadow(this.meadow, w, h);
    drawFlowers(this.meadow, w, h, MENU_LAYOUT.flowerDensity, MENU_LAYOUT.flowerColors);
    this.veil?.setSize(w, h);
    this.backdrop?.resize(w, h);
    this.ambient?.resize(w, h);

    const before = new Set(this.children.list);
    this.buildUi(w, h, entrance);
    this.ui = this.children.list.filter((obj) => !before.has(obj));
    for (const obj of this.ui) (obj as unknown as Phaser.GameObjects.Components.Depth).setDepth(DEPTH.ui);
  }

  private buildUi(w: number, h: number, entrance: boolean): void {
    const fx = MENU_FX.entrance;
    const progress = getStore(this).progress;

    // Corner: crystals and the toggles fade in.
    const cornerFrom = new Set(this.children.list);
    crystalCounter(this, w - px(14), px(30), progress.crystals);
    this.settingsToggles();
    const corner = this.children.list.filter((obj) => !cornerFrom.has(obj));
    if (entrance) {
      for (const obj of corner) (obj as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0);
      this.tweens.add({ targets: corner, alpha: 1, duration: fx.cornerMs });
    }

    const level = currentLevel(progress, ALL_LEVELS) ?? FIRST_LEVEL;
    const bw = Math.min(w - px(MENU_LAYOUT.sideClearance) * 2, px(300));
    const bh = px(64);
    const gap = px(18);
    const top = h * 0.5;

    // Soft panel behind the buttons, drawn around its center so it can grow in.
    const pad = px(MENU_LAYOUT.panelPadding);
    const panelW = bw + pad * 2;
    const panelH = bh * 3 + gap * 2 + pad * 2;
    const panelY = top - bh / 2 - pad;
    const panel = this.add.graphics({ x: w / 2, y: panelY + panelH / 2 });
    const r = px(26);
    panel.fillStyle(COLORS.outline, 0.25).fillRoundedRect(-panelW / 2 + px(4), -panelH / 2 + px(6), panelW, panelH, r);
    panel.fillStyle(COLORS.panel, MENU_LAYOUT.panelAlpha).fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, r);
    panel.lineStyle(px(4), COLORS.panelEdge, 1).strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, r);
    if (entrance) {
      panel.setAlpha(0).setScale(fx.panelFromScale);
      this.tweens.add({ targets: panel, alpha: 1, duration: fx.panelMs * 0.6, delay: fx.panelDelayMs });
      this.tweens.add({ targets: panel, scale: 1, duration: fx.panelMs, delay: fx.panelDelayMs, ease: 'Back.Out' });
    }

    // Title: drops in, then bobs gently; the shine sweeps over it.
    const titleSize = Math.min(56, (w / px(1)) * 0.12);
    const titleY = Math.min(h * 0.28, panelY - px(titleSize) * 0.9);
    const title = this.add.container(w / 2, titleY);
    this.title = new ShinyTitle(this, t('game.title'), titleSize, 8, MENU_LAYOUT.titleShadow);
    title.add(this.title.image);

    // Play glows behind the button while it breathes.
    const glowPad = px(MENU_FX.pulse.glowPad);
    const glow = this.add.graphics({ x: w / 2, y: top }).setAlpha(0);
    glow
      .fillStyle(MENU_FX.pulse.glowColor, 1)
      .fillRoundedRect(-bw / 2 - glowPad, -bh / 2 - glowPad, bw + glowPad * 2, bh + glowPad * 2, px(BUTTON_STYLE.radius) + px(4));

    const play = textButton(this, w / 2, top, bw, bh, t('menu.playLevel', { index: level.index }), () => {
      const data: BattleSceneData = { levelId: level.id };
      this.scene.start('BattleScene', data);
    }, { size: 26 });
    const map = textButton(this, w / 2, top + bh + gap, bw, bh, t('menu.map'), () => this.scene.start('ChapterMapScene'));
    const upgrades = textButton(this, w / 2, top + (bh + gap) * 2, bw, bh, t('menu.upgrades'), () =>
      this.scene.start('UpgradesScene', { from: 'MenuScene' }),
    );

    // Buttons rise in one by one; they can be pressed while moving.
    if (entrance) {
      [play, map, upgrades].forEach((button, i) => {
        const delay = fx.buttonDelaysMs[i] ?? 0;
        const y = button.y;
        button.setAlpha(0).setY(y + px(fx.buttonRise));
        this.tweens.add({ targets: button, alpha: 1, duration: fx.buttonMs / 2, delay });
        this.tweens.add({ targets: button, y, duration: fx.buttonMs, delay, ease: 'Back.Out' });
      });
      title.setAlpha(0).setY(titleY - px(fx.titleDrop));
      this.tweens.add({ targets: title, alpha: 1, duration: fx.titleMs / 4 });
      this.tweens.add({ targets: title, y: titleY, duration: fx.titleMs, ease: 'Back.Out' });
    }

    // Idle motion starts once the entrance is over (right away after a resize).
    const lastButton = (fx.buttonDelaysMs[fx.buttonDelaysMs.length - 1] ?? 0) + fx.buttonMs;
    const idleDelay = entrance ? Math.max(fx.titleMs, lastButton) : 0;
    this.tweens.add({
      targets: title,
      y: titleY - px(MENU_FX.titleBob),
      duration: MENU_FX.titleBobMs,
      delay: idleDelay,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    if (MENU_FX.showPulse) {
      const half = MENU_FX.pulse.periodMs / 2;
      const breathe = { duration: half, delay: idleDelay, yoyo: true, repeat: -1, ease: 'Sine.InOut' };
      this.tweens.add({ targets: play, scale: MENU_FX.pulse.scale, ...breathe });
      this.tweens.add({ targets: glow, alpha: MENU_FX.pulse.glowAlpha, scale: MENU_FX.pulse.scale, ...breathe });
    }
  }

  /** Sound and music on/off in the top-left corner (the battle pause panel has the same toggles). */
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
        this.build(false);
      });
    });
  }
}
