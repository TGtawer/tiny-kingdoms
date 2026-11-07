import * as Phaser from 'phaser';
import { COLORS, SETTINGS_PANEL } from '../config/game';
import { volumeAt } from '../core/meta/settings';
import { t, type Lang } from '../i18n/i18n';
import { Button } from './Button';
import { drawNote, drawOff, drawSpeaker } from './icons';
import { px, textStyle } from './layout';
import { playSfx } from './sound';

export type SettingsChannel = 'sound' | 'music';

/** What the panel reads and changes; the scenes build it over the save (scenes/settings.ts). */
export interface SettingsModel {
  isOn(channel: SettingsChannel): boolean;
  volume(channel: SettingsChannel): number;
  setOn(channel: SettingsChannel, on: boolean): void;
  /** Applies at once while dragging (and turns the channel on); `commit` saves it when the finger lifts. */
  setVolume(channel: SettingsChannel, v: number): void;
  commit(): void;
  lang(): Lang;
  /** Without it the panel has no language row (the battle pause). */
  setLang?(lang: Lang): void;
}

export interface SettingsPanelOptions {
  depth: number;
  onClose?: () => void;
}

const LANGS: readonly Lang[] = ['ru', 'en'];

interface Slider {
  channel: SettingsChannel;
  /** Track ends (0% and 100%) and its center line, game px. */
  x0: number;
  x1: number;
  y: number;
  g: Phaser.GameObjects.Graphics;
  /** The on/off button's icon. */
  icon: Phaser.GameObjects.Graphics;
}

/**
 * Settings: sound and music (on/off and a volume slider, 5% steps) and the language (RU / EN).
 * A modal panel over a dim, in the style of the pause and result panels; «Done» or a tap on the dim closes it.
 * Shared by the main menu and the battle pause. Redraws itself on resize; the values live in the save.
 */
export class SettingsPanel {
  private readonly root: Phaser.GameObjects.Container;
  private sliders: Slider[] = [];
  private dragging: Slider | null = null;
  private closed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly model: SettingsModel,
    private readonly options: SettingsPanelOptions,
  ) {
    this.root = scene.add.container(0, 0).setDepth(options.depth);
    this.build();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** Closes the panel (the «Done» button, a tap on the dim). */
  close(): void {
    if (this.closed) return;
    this.destroy();
    this.options.onClose?.();
  }

  /** Removes the panel without the close callback (the scene shuts down). */
  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.build, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.root.destroy();
  }

  private build(): void {
    if (this.closed) return;
    const P = SETTINGS_PANEL;
    const scene = this.scene;
    this.root.removeAll(true);
    this.sliders = [];
    this.dragging = null;

    const w = scene.scale.width;
    const h = scene.scale.height;
    const rows: Array<SettingsChannel | 'lang'> = ['sound', 'music', ...(this.model.setLang ? (['lang'] as const) : [])];
    const panelW = Math.min(w - 2 * px(P.side), px(P.width));
    // On a short screen (a phone in landscape) the gaps shrink to fit; controls stay at least the touch size.
    const full = px(P.rowsTop) + rows.length * px(P.rowH) + (rows.length - 1) * px(P.rowGap) + px(P.doneGap) + px(P.doneH) + px(P.bottom);
    const fit = Math.min(1, (h - 2 * px(P.side)) / full);
    const gap = (v: number): number => px(v) * fit;
    const rowH = Math.max(px(P.toggle), gap(P.rowH));
    const rowsH = rows.length * rowH + (rows.length - 1) * gap(P.rowGap);
    const panelH = gap(P.rowsTop) + rowsH + gap(P.doneGap) + px(P.doneH) + gap(P.bottom);
    const left = w / 2 - panelW / 2;
    const top = h / 2 - panelH / 2;

    // Full-screen dim: swallows taps; a tap that starts and ends on it closes the panel.
    const dim = scene.add.rectangle(w / 2, h / 2, w, h, COLORS.dim, P.dimAlpha).setInteractive();
    let downOnDim = false;
    dim.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      downOnDim = true;
    });
    dim.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      const close = downOnDim && this.dragging === null;
      downOnDim = false;
      if (close) this.close();
    });

    const g = scene.add.graphics();
    const r = px(P.radius);
    g.fillStyle(COLORS.outline, P.shadowAlpha).fillRoundedRect(left + px(P.shadowX), top + px(P.shadowY), panelW, panelH, r);
    g.fillStyle(COLORS.panel, 1).fillRoundedRect(left, top, panelW, panelH, r);
    g.lineStyle(px(P.edge), COLORS.panelEdge, 1).strokeRoundedRect(left, top, panelW, panelH, r);
    // Taps on the panel itself never reach the dim.
    const block = scene.add.zone(w / 2, h / 2, panelW, panelH).setInteractive();
    const title = scene.add
      .text(w / 2, top + gap(P.titleY), t('settings.title'), textStyle(P.titleSize, COLORS.text))
      .setOrigin(0.5)
      .setStroke('#1f2937', px(6));
    this.root.add([dim, g, block, title]);

    const contentL = left + px(P.padX);
    const contentR = left + panelW - px(P.padX);
    const controlsL = contentL + px(P.labelW);
    let y = top + gap(P.rowsTop);
    for (const row of rows) {
      const cy = y + rowH / 2;
      const label = scene.add.text(contentL, cy, t(`settings.${row}`), textStyle(P.labelSize, COLORS.textDark)).setOrigin(0, 0.5);
      // A long label shrinks into its column.
      if (label.width > px(P.labelW) - px(P.gap) / 2) label.setScale((px(P.labelW) - px(P.gap) / 2) / label.width);
      this.root.add(label);
      if (row === 'lang') this.langRow(controlsL, contentR, cy);
      else this.channelRow(row, controlsL, contentR, cy);
      y += rowH + gap(P.rowGap);
    }

    const done = new Button(scene, w / 2, top + panelH - gap(P.bottom) - px(P.doneH) / 2, {
      width: Math.min(px(P.doneW), panelW - 2 * px(P.padX)),
      height: px(P.doneH),
      onClick: () => this.close(),
    });
    done.add(scene.add.text(0, -px(2), t('settings.done'), textStyle(P.doneSize, COLORS.textDark)).setOrigin(0.5));
    this.root.add(done);
  }

  /** On/off button and a volume slider. */
  private channelRow(channel: SettingsChannel, from: number, to: number, cy: number): void {
    const P = SETTINGS_PANEL;
    const S = P.slider;
    const scene = this.scene;
    const size = px(P.toggle);
    const icon = scene.add.graphics();
    const toggle = new Button(scene, from + size / 2, cy, {
      width: size,
      height: size,
      onClick: () => {
        this.model.setOn(channel, !this.model.isOn(channel));
        this.drawSlider(slider);
      },
    });
    toggle.add(icon);

    const knob = px(S.knob);
    const x0 = from + size + px(P.gap) + knob;
    const x1 = to - knob;
    const slider: Slider = { channel, x0, x1, y: cy, g: scene.add.graphics(), icon };
    const zone = scene.add.zone((x0 + x1) / 2, cy, x1 - x0 + knob * 2, Math.max(px(S.hit), knob * 2)).setInteractive();
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.dragging = slider;
      this.slideTo(slider, pointer.x);
    });
    this.root.add([toggle, slider.g, zone]);
    this.sliders.push(slider);
    this.drawSlider(slider);
  }

  /** Two language buttons, the chosen one bright; the names are in their own languages. */
  private langRow(from: number, to: number, cy: number): void {
    const P = SETTINGS_PANEL;
    const current = this.model.lang();
    const bw = (to - from - px(P.langGap)) / 2;
    LANGS.forEach((lang, i) => {
      const chosen = lang === current;
      const button = new Button(this.scene, from + bw / 2 + i * (bw + px(P.langGap)), cy, {
        width: bw,
        height: px(P.langH),
        ...(chosen ? {} : { color: COLORS.buttonSecondary }),
        onClick: () => {
          if (lang !== this.model.lang()) this.model.setLang?.(lang);
        },
      });
      button.add(this.scene.add.text(0, -px(2), t(`lang.${lang}`), textStyle(P.langSize, COLORS.textDark)).setOrigin(0.5));
      this.root.add(button);
    });
  }

  private slideTo(slider: Slider, x: number): void {
    const v = volumeAt(x, slider.x0, slider.x1, SETTINGS_PANEL.slider.step);
    if (v === this.model.volume(slider.channel) && this.model.isOn(slider.channel)) return;
    this.model.setVolume(slider.channel, v);
    this.drawSlider(slider);
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (this.dragging && pointer.isDown) this.slideTo(this.dragging, pointer.x);
  }

  /** The finger lifts: the volume is saved; the sound slider plays a click at the new level. */
  private onUp(): void {
    const slider = this.dragging;
    if (!slider) return;
    this.dragging = null;
    if (slider.channel === 'sound') playSfx('click');
    this.model.commit();
  }

  private drawSlider(slider: Slider): void {
    const P = SETTINGS_PANEL;
    const S = P.slider;
    const on = this.model.isOn(slider.channel);
    const v = this.model.volume(slider.channel);
    const g = slider.g;
    const th = px(S.trackH);
    const r = th / 2;
    const kx = slider.x0 + (slider.x1 - slider.x0) * v;
    g.clear().setAlpha(on ? 1 : S.offAlpha);
    g.fillStyle(S.track, 1).fillRoundedRect(slider.x0 - r, slider.y - r, slider.x1 - slider.x0 + th, th, r);
    g.fillStyle(S.fill, 1).fillRoundedRect(slider.x0 - r, slider.y - r, kx - slider.x0 + th, th, r);
    g.lineStyle(px(S.outline), COLORS.outline, 1).strokeRoundedRect(slider.x0 - r, slider.y - r, slider.x1 - slider.x0 + th, th, r);
    g.fillStyle(S.knobColor, 1).fillCircle(kx, slider.y, px(S.knob));
    g.strokeCircle(kx, slider.y, px(S.knob));

    const icon = slider.icon;
    const size = px(P.toggleIcon);
    icon.clear();
    (slider.channel === 'sound' ? drawSpeaker : drawNote)(icon, 0, -px(1), size);
    if (!on) drawOff(icon, 0, -px(1), size);
  }
}
