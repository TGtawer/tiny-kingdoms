import * as Phaser from 'phaser';
import { SPELLS, type LeaderId, type SpellId } from '../config/balance';
import { COLORS, HUD, LEADER_CARD, RESULT_PANEL } from '../config/game';
import type { UiAnchor } from '../core/tutorial/tutorial';
import { sideGoldRate } from '../core/sim/economy';
import { spellCooldownMs } from '../core/sim/spells';
import type { Side, World } from '../core/sim/World';
import { t } from '../i18n/i18n';
import { BakedGraphics } from '../view/BakedGraphics';
import { Button } from '../view/Button';
import { drawCoin, drawCrystal, drawLeader, drawPause, drawSpell, drawStar } from '../view/icons';
import { drawHintPlaque } from '../view/hintPlaque';
import { showIntroCard } from '../view/introCard';
import { px, textStyle } from '../view/layout';
import { perfFlag } from '../dev/perfFlags';

export interface HudCallbacks {
  onPause(): void;
  /** Speed-up button: toggles ×1 / ×SPEED_UP.multiplier. */
  onSpeed(): void;
  onSpell(spell: SpellId): void;
}

interface SpellButton {
  spell: SpellId;
  button: Button;
  cooldown: Phaser.GameObjects.Graphics;
  seconds: Phaser.GameObjects.Text;
  armedRing: Phaser.GameObjects.Graphics;
  shownSeconds: number;
}

/** In-battle overlay: gold, pause button, spell buttons, pause and result panels. */
/** Victory star row: which of the three conditions were met, and their captions. */
/** An on/off setting shown as a button label. */
export interface StarRow {
  earned: readonly boolean[];
  labels: readonly string[];
}

export class BattleHUD {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly topBar: Phaser.GameObjects.Graphics;
  private readonly coin: Phaser.GameObjects.Graphics;
  private readonly goldText: Phaser.GameObjects.Text;
  /** "+N/s" next to the gold counter. */
  private readonly rateText: Phaser.GameObjects.Text;
  private shownRate = -1;
  private readonly title: Phaser.GameObjects.Text;
  private readonly pauseButton: Button;
  private readonly speedButton: Button;
  private readonly speedText: Phaser.GameObjects.Text;
  private readonly speedRing: Phaser.GameObjects.Graphics;
  private shownSpeed = '';
  /** Enemy leader portrait next to the title. */
  private readonly leaderIcon: Phaser.GameObjects.Graphics;
  private leader: LeaderId | null = null;
  /** Level goal plaque under the top bar. */
  private readonly goalText: Phaser.GameObjects.Text;
  private readonly goalPlaque: Phaser.GameObjects.Graphics;
  private readonly spells: SpellButton[] = [];
  private overlay: Phaser.GameObjects.Container | null = null;
  private shownGold = -1;
  /** Gold counter hidden until the player can spend gold (TUTORIAL.md T-3). */
  private goldVisible = true;

  constructor(scene: Phaser.Scene, title: string, spells: readonly SpellId[], callbacks: HudCallbacks) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(100);

    this.topBar = scene.add.graphics();
    this.coin = scene.add.graphics();
    this.goldText = scene.add.text(0, 0, '0', textStyle(24)).setOrigin(0, 0.5).setStroke('#1f2937', px(5));
    this.rateText = scene.add.text(0, 0, '', textStyle(15, COLORS.gold)).setOrigin(0, 0.5).setStroke('#1f2937', px(4));
    this.title = scene.add.text(0, 0, title, textStyle(20)).setOrigin(0.5).setStroke('#1f2937', px(5));

    const pauseSize = px(HUD.pauseButton);
    this.pauseButton = new Button(scene, 0, 0, { width: pauseSize, height: pauseSize, onClick: callbacks.onPause });
    const pauseIcon = scene.add.graphics();
    drawPause(pauseIcon, 0, 0, pauseSize * 0.5);
    this.pauseButton.add(pauseIcon);

    // Speed-up: hidden until the player holds enough nodes (see BattleScene).
    this.speedButton = new Button(scene, 0, 0, { width: pauseSize, height: pauseSize, onClick: callbacks.onSpeed });
    this.speedText = scene.add.text(0, -px(2), '', textStyle(20, COLORS.textDark)).setOrigin(0.5);
    this.speedButton.add(this.speedText);
    this.speedRing = scene.add.graphics();
    this.speedButton.setVisible(false);
    this.speedRing.setVisible(false);

    this.leaderIcon = scene.add.graphics();
    this.goalPlaque = scene.add.graphics().setVisible(false);
    this.goalText = scene.add.text(0, 0, '', textStyle(15, COLORS.textDark)).setOrigin(0.5).setVisible(false);
    this.root.add([
      this.topBar,
      this.coin,
      this.goldText,
      this.rateText,
      this.title,
      this.leaderIcon,
      this.goalPlaque,
      this.goalText,
      this.speedRing,
      this.pauseButton,
      this.speedButton,
    ]);

    for (const spell of spells) {
      const size = px(HUD.spellButton);
      const armedRing = scene.add.graphics();
      const button = new Button(scene, 0, 0, {
        width: size,
        height: size,
        color: COLORS.panel,
        radius: px(16),
        onClick: () => callbacks.onSpell(spell),
      });
      const icon = scene.add.graphics();
      drawSpell(icon, spell, 0, -size * 0.1, size * 0.5);
      const costCoin = scene.add.graphics();
      drawCoin(costCoin, -size * 0.14, size * 0.28, px(12));
      const cost = scene.add
        .text(-size * 0.04, size * 0.28, String(SPELLS[spell].cost), textStyle(13, COLORS.textDark))
        .setOrigin(0, 0.5);
      const cooldown = scene.add.graphics();
      const seconds = scene.add.text(0, 0, '', textStyle(22)).setOrigin(0.5).setStroke('#1f2937', px(5));
      button.add([icon, costCoin, cost, cooldown, seconds]);
      this.root.add([armedRing, button]);
      this.spells.push({ spell, button, cooldown, seconds, armedRing, shownSeconds: -1 });
    }

    this.layout();
  }

  /** Goal line under the top bar; null hides it. Cheap to call every frame. */
  setGoal(text: string | null): void {
    if (text === null) {
      this.goalText.setVisible(false);
      this.goalPlaque.setVisible(false);
      return;
    }
    if (this.goalText.text !== text) {
      const width = this.goalText.width;
      this.goalText.setText(text);
      // Only a change of size needs a new plaque (the countdown keeps the same width most of the time).
      if (this.goalText.width !== width) this.drawGoalPlaque();
    }
    this.goalText.setVisible(true);
    this.goalPlaque.setVisible(true);
  }

  private drawGoalPlaque(): void {
    const g = this.goalPlaque;
    g.clear();
    const h = Math.min(px(HUD.goalBar) - px(4), this.goalText.height + px(8));
    drawHintPlaque(g, this.goalText.x, this.goalText.y, this.goalText.width + px(24), h);
  }

  /** Shows the enemy leader's portrait in the top bar. */
  setLeader(leader: LeaderId | null): void {
    this.leader = leader;
    this.layout();
  }

  /**
   * Leader card before the battle: portrait, name, one line. Closes on tap or after LEADER_CARD.autoCloseMs.
   */
  showLeaderCard(leader: LeaderId, onClose: () => void): void {
    showIntroCard(this.scene, {
      accent: COLORS.faction.enemy,
      picture: (g, size) => drawLeader(g, leader, 0, 0, size),
      pictureSize: LEADER_CARD.portrait,
      title: t(`leader.${leader}`),
      body: t(`leader.${leader}.quote`),
      autoCloseMs: LEADER_CARD.autoCloseMs,
      onClose,
    });
  }

  get isGoldVisible(): boolean {
    return this.goldVisible;
  }

  /** Shows or hides the gold counter and income; the title takes the freed space. */
  setGoldVisible(visible: boolean): void {
    this.goldVisible = visible;
    this.coin.setVisible(visible);
    this.goldText.setVisible(visible);
    this.rateText.setVisible(visible);
    this.placeTitle();
  }

  get hasSpellBar(): boolean {
    return this.spells.length > 0;
  }

  /**
   * Speed-up button state: hidden when not available; `multiplier` is the current speed (1 = normal).
   * Cheap to call every frame.
   */
  setSpeed(available: boolean, multiplier: number): void {
    const key = available ? String(multiplier) : '';
    if (key === this.shownSpeed) return;
    const appearing = available && this.shownSpeed === '';
    this.shownSpeed = key;
    this.speedButton.setVisible(available);
    this.speedRing.setVisible(available && multiplier > 1);
    if (!available) return;

    this.speedText.setText(t('battle.speed', { mult: multiplier }));
    const size = this.speedButton.buttonWidth;
    this.speedRing.clear();
    this.speedRing.lineStyle(px(4), COLORS.hint, 1).strokeRoundedRect(-size / 2 - px(4), -size / 2 - px(2), size + px(8), size + px(8), px(16));
    if (appearing) {
      this.speedButton.setScale(0.6);
      this.scene.tweens.add({ targets: this.speedButton, scale: 1, duration: 220, ease: 'Back.Out' });
    }
  }

  /** Hides the spell buttons while another panel (the build menu) takes the bottom bar. */
  setSpellBarVisible(visible: boolean): void {
    for (const s of this.spells) {
      s.button.setVisible(visible);
      s.armedRing.setVisible(visible);
    }
  }

  layout(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const barH = px(HUD.topBar);

    this.topBar.clear();
    this.topBar.fillStyle(COLORS.outline, 0.28).fillRect(0, 0, w, barH);

    drawCoinAt(this.coin, px(16) + px(14), barH / 2, px(28));
    this.goldText.setPosition(px(16) + px(34), barH / 2);
    this.placeRate();
    this.goalText.setPosition(w / 2, barH + px(HUD.goalBar) / 2);
    this.drawGoalPlaque();
    this.pauseButton.setPosition(w - px(12) - this.pauseButton.buttonWidth / 2, barH / 2);
    this.speedButton.setPosition(
      this.pauseButton.x - this.pauseButton.buttonWidth / 2 - px(HUD.topBarGap) - this.speedButton.buttonWidth / 2,
      barH / 2,
    );
    this.speedRing.setPosition(this.speedButton.x, this.speedButton.y);
    this.placeTitle();

    const size = px(HUD.spellButton);
    const gap = px(16);
    const total = this.spells.length * size + (this.spells.length - 1) * gap;
    const y = h - px(HUD.bottomBar) / 2;
    this.spells.forEach((s, i) => {
      s.button.setPosition(w / 2 - total / 2 + size / 2 + i * (size + gap), y);
      s.armedRing.setPosition(s.button.x, s.button.y);
    });

    if (this.overlay) {
      const rebuild = this.overlay.getData('rebuild') as (() => void) | undefined;
      rebuild?.();
    }
  }

  update(world: World, side: Side, armed: SpellId | null): void {
    const state = world.sides[side];
    const gold = Math.floor(state.gold);
    if (gold !== this.shownGold) {
      this.shownGold = gold;
      this.goldText.setText(String(gold));
      this.placeRate();
    }

    // Rounded to 0.1 so the label only changes when the income really changes.
    const rate = Math.round(sideGoldRate(world, side) * 10) / 10;
    if (rate !== this.shownRate) {
      const grew = this.shownRate >= 0 && rate > this.shownRate;
      this.shownRate = rate;
      this.rateText.setText(t('hud.goldRate', { rate: rate.toFixed(1) }));
      this.placeTitle();
      if (grew) {
        this.scene.tweens.killTweensOf(this.rateText);
        this.rateText.setScale(1.4);
        this.scene.tweens.add({ targets: this.rateText, scale: 1, duration: 350, ease: 'Back.Out' });
      }
    }

    for (const s of this.spells) {
      const remaining = state.spellCooldowns[s.spell];
      const total = spellCooldownMs(s.spell, state.modifiers);
      const size = px(HUD.spellButton);
      s.button.setEnabled(remaining <= 0 && state.gold >= SPELLS[s.spell].cost);

      const secs = Math.ceil(remaining / 1000);
      if (secs !== s.shownSeconds) {
        s.shownSeconds = secs;
        s.seconds.setText(secs > 0 ? String(secs) : '');
      }
      s.cooldown.clear();
      if (remaining > 0 && total > 0) {
        const frac = remaining / total;
        s.cooldown.fillStyle(COLORS.dim, 0.45);
        s.cooldown.slice(0, 0, size * 0.42, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false);
        s.cooldown.fillPath();
      }

      s.armedRing.clear();
      if (armed === s.spell) {
        const color = s.spell === 'fireball' ? COLORS.fireball : COLORS.reinforcement;
        s.armedRing.lineStyle(px(4), color, 1).strokeRoundedRect(-size / 2 - px(6), -size / 2 - px(4), size + px(12), size + px(12), px(20));
      }
    }
  }

  /** Pause panel with the sound and music on/off toggles (a toggle redraws the panel in place). */
  /** Pause panel; «Settings» opens the shared settings panel over it (sound, music; no language in a battle). */
  showPause(onResume: () => void, onRestart: () => void, onExit: () => void, onSettings: () => void): void {
    this.showPanel(t('pause.title'), [
      { label: t('pause.resume'), onClick: onResume },
      { label: t('pause.settings'), onClick: onSettings },
      { label: t('pause.restart'), onClick: onRestart },
      { label: t('pause.toMap'), onClick: onExit },
    ]);
  }

  /**
   * Result panel with the crystal reward; buttons are listed top to bottom, the first one is the main action.
   * On victory the reward crystals fly into the total counter, which counts up to `totalCrystals`.
   */
  showResult(
    title: string,
    won: boolean,
    crystals: number,
    totalCrystals: number,
    buttons: Array<{ label: string; onClick: () => void }>,
    extras: { stars?: StarRow; tip?: string } = {},
  ): void {
    // TODO(stage-6): "double for a rewarded ad" button on victory.
    this.showPanel(title, buttons, { celebrate: won, crystals, totalCrystals, primary: won, ...extras });
  }

  private placeRate(): void {
    this.rateText.setPosition(this.goldText.x + this.goldText.width + px(8), px(HUD.topBar) / 2 + px(2));
    this.placeTitle();
  }

  /**
   * Title and leader portrait share the free space between the gold block and the speed button
   * (reserved even while hidden, so nothing jumps when it appears). Centered when it fits;
   * on narrow screens the title shrinks and is dropped if it would get too small, the portrait stays.
   */
  private placeTitle(): void {
    const barH = px(HUD.topBar);
    const gap = px(HUD.topBarGap);
    const left = this.goldVisible ? this.rateText.x + this.rateText.width + gap : px(16);
    const right = this.speedButton.x - this.speedButton.buttonWidth / 2 - gap;
    const portrait = this.leader ? px(LEADER_CARD.hudPortrait) : 0;
    const portraitW = portrait > 0 ? portrait + gap : 0;

    this.title.setScale(1);
    const scale = Math.min(1, (right - left - portraitW) / this.title.width);
    const showTitle = scale >= HUD.titleMinScale;
    this.title.setVisible(showTitle).setScale(showTitle ? scale : 1);
    const titleW = showTitle ? this.title.displayWidth : 0;
    const groupW = portraitW + titleW - (titleW === 0 && portrait > 0 ? gap : 0);

    const w = this.scene.scale.width;
    const x0 = Math.max(left, Math.min(w / 2 - groupW / 2, right - groupW));
    if (showTitle) this.title.setPosition(x0 + portraitW + titleW / 2, barH / 2);
    this.leaderIcon.clear();
    if (this.leader) drawLeader(this.leaderIcon, this.leader, x0 + portrait / 2, barH / 2, portrait);
  }

  /** Screen position of a HUD element for tutorial highlights; null while it is hidden. */
  anchor(anchor: UiAnchor): { x: number; y: number } | null {
    switch (anchor) {
      case 'gold':
        return this.goldVisible ? { x: this.coin.x + px(16) + px(14), y: px(HUD.topBar) / 2 } : null;
      case 'spell': {
        const button = this.spells[0]?.button;
        return button?.visible ? { x: button.x, y: button.y } : null;
      }
      case 'goal':
        return this.goalText.visible ? { x: this.goalText.x, y: this.goalText.y } : null;
    }
  }

  hideOverlay(): void {
    this.overlay?.destroy();
    this.overlay = null;
  }

  private showPanel(
    title: string,
    buttons: Array<{ label: string; onClick: () => void }>,
    options: {
      celebrate?: boolean;
      crystals?: number;
      totalCrystals?: number;
      primary?: boolean;
      fade?: boolean;
      /** Star rating row under the title (victory). */
      stars?: StarRow;
      /** One advice line above the buttons (defeat). */
      tip?: string;
    } = {},
  ): void {
    this.hideOverlay();
    const scene = this.scene;
    const overlay = scene.add.container(0, 0).setDepth(200);
    this.overlay = overlay;
    const crystals = options.crystals ?? null;
    let animated = false;

    const build = (): void => {
      overlay.removeAll(true);
      const w = scene.scale.width;
      const h = scene.scale.height;

      // Full-screen blocker: dims the field and swallows taps.
      const dim = scene.add.rectangle(w / 2, h / 2, w, h, COLORS.dim, 0.5).setInteractive();
      const panelW = Math.min(w - px(32), px(320));
      const bh = px(56);
      const mainH = options.primary ? px(RESULT_PANEL.primaryButtonHeight) : bh;
      const gap = px(12);
      const rewardH = crystals === null ? 0 : px(44);
      const starsH = options.stars === undefined ? 0 : px(RESULT_PANEL.starSize + RESULT_PANEL.starLabelH + 14);
      const tipText = options.tip
        ? scene.add.text(w / 2, 0, options.tip, textStyle(16, COLORS.textDark)).setOrigin(0.5, 0).setAlign('center')
        : null;
      tipText?.setWordWrapWidth(panelW - px(40), true);
      const tipH = tipText ? tipText.height + px(14) : 0;
      const top = px(96) + starsH + rewardH + tipH;
      const panelH = top + mainH + gap + (buttons.length - 1) * (bh + gap);
      const panel = scene.add.graphics();
      const px0 = w / 2 - panelW / 2;
      const py0 = h / 2 - panelH / 2;
      panel.fillStyle(COLORS.outline, 0.4).fillRoundedRect(px0 + px(4), py0 + px(6), panelW, panelH, px(22));
      panel.fillStyle(COLORS.panel, 1).fillRoundedRect(px0, py0, panelW, panelH, px(22));
      panel.lineStyle(px(4), COLORS.panelEdge, 1).strokeRoundedRect(px0, py0, panelW, panelH, px(22));

      const titleColor = options.celebrate ? COLORS.gold : COLORS.text;
      const titleText = scene.add
        .text(w / 2, py0 + px(48), title, textStyle(32, titleColor))
        .setOrigin(0.5)
        .setStroke('#1f2937', px(6));
      overlay.add([dim, panel, titleText]);

      if (options.stars !== undefined) {
        const starY = py0 + px(96) + px(RESULT_PANEL.starSize) / 2 - px(8);
        this.drawStars(overlay, w / 2, starY, Math.min(px(RESULT_PANEL.starSlot), (panelW - px(16)) / 3), options.stars, !animated);
      }
      if (tipText) {
        tipText.setY(py0 + px(96) + starsH + rewardH);
        overlay.add(tipText);
      }

      let rewardAt: { x: number; y: number } | null = null;
      if (crystals !== null) {
        const ry = py0 + px(96) + starsH + rewardH / 2 - px(8);
        const label = scene.add.text(w / 2 + px(14), ry, `+${crystals}`, textStyle(28, COLORS.text)).setOrigin(0.5).setStroke('#1f2937', px(6));
        rewardAt = { x: label.x - label.width / 2 - px(20), y: ry };
        const icon = this.crystalImage(px(RESULT_PANEL.rewardCrystal)).setPosition(rewardAt.x, rewardAt.y);
        overlay.add([icon, label]);
      }

      let y = py0 + top;
      buttons.forEach((b, i) => {
        const main = i === 0 && options.primary === true;
        const height = main ? mainH : bh;
        const button = new Button(scene, w / 2, y + height / 2, {
          width: main ? panelW - px(32) : panelW - px(48),
          height,
          onClick: b.onClick,
          ...(options.primary && !main ? { color: COLORS.buttonSecondary } : {}),
        });
        button.add(scene.add.text(0, -px(2), b.label, textStyle(main ? 26 : 20, COLORS.textDark)).setOrigin(0.5));
        overlay.add(button);
        y += height + gap;
      });

      // Total crystals at the top right; on victory the reward flies into it (only on the first build).
      if (options.totalCrystals !== undefined && rewardAt) {
        const total = options.totalCrystals;
        const before = total - (crystals ?? 0);
        const cx = w - px(14);
        const cy = px(HUD.topBar) / 2;
        // Dev `?perf=nofly` (PF-7): no flight, the counter shows the total at once.
        const fly = !animated && options.celebrate === true && (crystals ?? 0) > 0 && !(import.meta.env.DEV && perfFlag('nofly'));
        animated = true;
        const text = scene.add
          .text(cx, cy, String(fly ? before : total), textStyle(24))
          .setOrigin(1, 0.5)
          .setStroke('#1f2937', px(5));
        // The counter icon sits in a holder, so its landing pulse scales from the center.
        const icon = scene.add.container(0, 0, [this.crystalImage(px(RESULT_PANEL.counterCrystal))]);
        const iconAt = (): { x: number; y: number } => ({ x: cx - text.width - px(18), y: cy });
        icon.setPosition(iconAt().x, iconAt().y);
        overlay.add([icon, text]);
        if (fly) this.flyCrystals(overlay, rewardAt, iconAt(), before, total, text, icon, iconAt);
      }
    };

    overlay.setData('rebuild', build);
    build();
    if (options.fade !== false) {
      overlay.setAlpha(0);
      scene.tweens.add({ targets: overlay, alpha: 1, duration: 160 });
    }
  }

  /**
   * Row of three stars, each over the label of its condition; earned ones pop in one by one the first time,
   * missed conditions are dimmed. The stars are images of baked textures (docs/PERF.md PF-7): a star is two concave
   * fills that Phaser 4 would triangulate again every frame, and six star Graphics between the labels broke the
   * batch into extra draw calls. Each earned star is an image in a holder at its center (the pop scales from the
   * center). Order for batching: all empty stars, then all earned ones, then the labels — on phones Phaser draws one
   * texture per batch (autoMobileTextures), so alternating textures would cost a draw call each.
   */
  private drawStars(overlay: Phaser.GameObjects.Container, cx: number, cy: number, slot: number, row: StarRow, animate: boolean): void {
    const P = RESULT_PANEL;
    const size = px(P.starSize);
    // On whole pixels: the baked texture is not resampled.
    const at = (i: number): { x: number; y: number } => ({ x: Math.round(cx + (i - 1) * slot), y: Math.round(cy) });
    row.earned.forEach((_, i) => overlay.add(this.starImage(size, false).setPosition(at(i).x, at(i).y)));
    let shown = 0;
    row.earned.forEach((earned, i) => {
      if (!earned) return;
      const holder = this.scene.add.container(at(i).x, at(i).y, [this.starImage(size, true)]);
      overlay.add(holder);
      if (animate) {
        holder.setScale(0);
        this.scene.tweens.add({ targets: holder, scale: 1, delay: 200 + shown * P.starStaggerMs, duration: 260, ease: 'Back.Out' });
      }
      shown += 1;
    });

    row.earned.forEach((earned, i) => {
      const x = cx + (i - 1) * slot;
      const label = this.scene.add
        .text(x, cy + size / 2 + px(4), row.labels[i] ?? '', textStyle(P.starLabelSize, COLORS.textDark))
        .setOrigin(0.5, 0)
        .setAlpha(earned ? 1 : 0.5);
      if (label.width > slot - px(4)) label.setScale((slot - px(4)) / label.width);
      overlay.add(label);
    });
  }

  /**
   * Bakes the result screen icons at battle start (docs/PERF.md PF-7): the first bake of a texture costs a long
   * frame, which must not land on the moment the victory panel opens.
   */
  prebakeResultIcons(): void {
    const P = RESULT_PANEL;
    for (const earned of [false, true]) this.starImage(px(P.starSize), earned).destroy();
    for (const size of [P.rewardCrystal, P.counterCrystal, P.flyCrystal]) this.crystalImage(px(size)).destroy();
  }

  private starImage(size: number, earned: boolean): Phaser.GameObjects.Image {
    return this.bakedIcon(`star-${earned ? 'full' : 'empty'}-${Math.round(size * 100)}`, size, (g) => drawStar(g, 0, 0, size, earned));
  }

  /**
   * A crystal of `size` game px as an Image of a baked texture, centered on its position. A Graphics crystal is
   * rebuilt by Phaser 4 every frame, and the flight used to create and destroy up to 8 of them (the victory screen
   * dipped to ~54 FPS on a phone while they flew).
   */
  private crystalImage(size: number): Phaser.GameObjects.Image {
    return this.bakedIcon(`crystal-${Math.round(size * 100)}`, size, (g) => drawCrystal(g, 0, 0, size));
  }

  /**
   * An icon drawn around (0, 0) within `size`, baked once per key (docs/PERF.md PF-7) and kept for later battles;
   * returns an Image centered on its position, shown at its drawn size.
   */
  private bakedIcon(key: string, size: number, draw: (g: Phaser.GameObjects.Graphics) => void): Phaser.GameObjects.Image {
    const P = RESULT_PANEL;
    const ss = P.bakeSupersample;
    if (!this.scene.textures.exists(key)) {
      const baked = new BakedGraphics(this.scene, key, ss);
      draw(baked.graphics);
      // A whole-pixel box around the center, so the texture's middle is the icon's center.
      const reach = Math.ceil(size / 2 + px(P.bakeMargin));
      baked.bake(0, 0, { left: reach, right: reach, top: reach, bottom: reach });
      baked.release();
      baked.image.destroy();
    }
    return this.scene.add.image(0, 0, key).setScale(1 / ss);
  }

  /**
   * Reward crystals fly from the reward label to the counter, which counts up as they land. Flying crystals are
   * baked images; the counter text is redrawn only when its number changes; one landing pulse at a time.
   */
  private flyCrystals(
    overlay: Phaser.GameObjects.Container,
    from: { x: number; y: number },
    to: { x: number; y: number },
    before: number,
    total: number,
    text: Phaser.GameObjects.Text,
    icon: Phaser.GameObjects.Container,
    iconAt: () => { x: number; y: number },
  ): void {
    const scene = this.scene;
    const P = RESULT_PANEL;
    const base = 1 / P.bakeSupersample;
    const count = Math.min(P.flyingCrystals, total - before);
    let pulse: Phaser.Tweens.Tween | null = null;
    for (let i = 0; i < count; i++) {
      const crystal = this.crystalImage(px(P.flyCrystal));
      crystal.setPosition(from.x, from.y).setScale(1.2 * base);
      overlay.add(crystal);
      scene.tweens.add({
        targets: crystal,
        x: to.x,
        y: to.y,
        scale: 0.8 * base,
        delay: P.flyDelayMs + i * P.flyStaggerMs,
        duration: P.flyDurationMs,
        ease: 'Cubic.In',
        onComplete: () => {
          crystal.destroy();
          if (!icon.active) return;
          // Restart the pulse instead of stacking a new tween on every landing.
          pulse?.stop();
          icon.setScale(1);
          pulse = scene.tweens.add({ targets: icon, scale: P.landPulse, duration: P.landPulseMs, yoyo: true });
        },
      });
    }
    const shown = { value: before };
    let drawn = before;
    scene.tweens.add({
      targets: shown,
      value: total,
      delay: P.flyDelayMs + P.flyDurationMs,
      duration: Math.max(1, (count - 1) * P.flyStaggerMs),
      onUpdate: () => {
        const value = Math.round(shown.value);
        if (!text.active || value === drawn) return;
        drawn = value;
        // A Text redraw is a canvas paint and a GPU upload: only when the number changes.
        const width = text.width;
        text.setText(String(value));
        if (text.width !== width) {
          const p = iconAt();
          icon.setPosition(p.x, p.y);
        }
      },
    });
  }

  destroy(): void {
    this.hideOverlay();
    this.root.destroy();
  }
}

function drawCoinAt(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  g.clear();
  drawCoin(g, x, y, size);
}
