import * as Phaser from 'phaser';
import { SPELLS, type SpellId } from '../config/balance';
import { COLORS, HUD } from '../config/game';
import { spellCooldownMs } from '../core/sim/spells';
import type { Side, World } from '../core/sim/World';
import { t } from '../i18n/i18n';
import { Button } from '../view/Button';
import { drawCoin, drawCrystal, drawPause, drawSpell } from '../view/icons';
import { px, textStyle } from '../view/layout';

export interface HudCallbacks {
  onPause(): void;
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
export class BattleHUD {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly topBar: Phaser.GameObjects.Graphics;
  private readonly coin: Phaser.GameObjects.Graphics;
  private readonly goldText: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private readonly pauseButton: Button;
  private readonly spells: SpellButton[] = [];
  private overlay: Phaser.GameObjects.Container | null = null;
  private shownGold = -1;

  constructor(scene: Phaser.Scene, title: string, spells: readonly SpellId[], callbacks: HudCallbacks) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(100);

    this.topBar = scene.add.graphics();
    this.coin = scene.add.graphics();
    this.goldText = scene.add.text(0, 0, '0', textStyle(24)).setOrigin(0, 0.5).setStroke('#1f2937', px(5));
    this.title = scene.add.text(0, 0, title, textStyle(20)).setOrigin(0.5).setStroke('#1f2937', px(5));

    const pauseSize = px(HUD.pauseButton);
    this.pauseButton = new Button(scene, 0, 0, { width: pauseSize, height: pauseSize, onClick: callbacks.onPause });
    const pauseIcon = scene.add.graphics();
    drawPause(pauseIcon, 0, 0, pauseSize * 0.5);
    this.pauseButton.add(pauseIcon);

    this.root.add([this.topBar, this.coin, this.goldText, this.title, this.pauseButton]);

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

  get hasSpellBar(): boolean {
    return this.spells.length > 0;
  }

  layout(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const barH = px(HUD.topBar);

    this.topBar.clear();
    this.topBar.fillStyle(COLORS.outline, 0.28).fillRect(0, 0, w, barH);

    drawCoinAt(this.coin, px(16) + px(14), barH / 2, px(28));
    this.goldText.setPosition(px(16) + px(34), barH / 2);
    this.title.setPosition(w / 2, barH / 2);
    this.pauseButton.setPosition(w - px(12) - this.pauseButton.buttonWidth / 2, barH / 2);

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

  showPause(onResume: () => void, onRestart: () => void, onExit: () => void): void {
    this.showPanel(t('pause.title'), [
      { label: t('pause.resume'), onClick: onResume },
      { label: t('pause.restart'), onClick: onRestart },
      { label: t('pause.toMap'), onClick: onExit },
    ]);
  }

  /** Result panel with the crystal reward; buttons are listed top to bottom. */
  showResult(title: string, won: boolean, crystals: number, buttons: Array<{ label: string; onClick: () => void }>): void {
    // TODO(stage-6): "double for a rewarded ad" button on victory.
    this.showPanel(title, buttons, won, crystals);
  }

  /** Screen position of the gold counter (for tutorial highlights). */
  goldAnchor(): { x: number; y: number } {
    return { x: this.coin.x + px(16) + px(14), y: px(HUD.topBar) / 2 };
  }

  hideOverlay(): void {
    this.overlay?.destroy();
    this.overlay = null;
  }

  private showPanel(
    title: string,
    buttons: Array<{ label: string; onClick: () => void }>,
    celebrate = false,
    crystals: number | null = null,
  ): void {
    this.hideOverlay();
    const scene = this.scene;
    const overlay = scene.add.container(0, 0).setDepth(200);
    this.overlay = overlay;

    const build = (): void => {
      overlay.removeAll(true);
      const w = scene.scale.width;
      const h = scene.scale.height;

      // Full-screen blocker: dims the field and swallows taps.
      const dim = scene.add.rectangle(w / 2, h / 2, w, h, COLORS.dim, 0.5).setInteractive();
      const panelW = Math.min(w - px(32), px(320));
      const bh = px(56);
      const gap = px(12);
      const rewardH = crystals === null ? 0 : px(44);
      const top = px(96) + rewardH;
      const panelH = top + buttons.length * (bh + gap);
      const panel = scene.add.graphics();
      const px0 = w / 2 - panelW / 2;
      const py0 = h / 2 - panelH / 2;
      panel.fillStyle(COLORS.outline, 0.4).fillRoundedRect(px0 + px(4), py0 + px(6), panelW, panelH, px(22));
      panel.fillStyle(COLORS.panel, 1).fillRoundedRect(px0, py0, panelW, panelH, px(22));
      panel.lineStyle(px(4), COLORS.panelEdge, 1).strokeRoundedRect(px0, py0, panelW, panelH, px(22));

      const titleColor = celebrate ? COLORS.gold : COLORS.text;
      const titleText = scene.add
        .text(w / 2, py0 + px(48), title, textStyle(32, titleColor))
        .setOrigin(0.5)
        .setStroke('#1f2937', px(6));
      overlay.add([dim, panel, titleText]);

      if (crystals !== null) {
        const ry = py0 + px(96) + rewardH / 2 - px(8);
        const label = scene.add.text(w / 2 + px(14), ry, `+${crystals}`, textStyle(28, COLORS.text)).setOrigin(0.5).setStroke('#1f2937', px(6));
        const icon = scene.add.graphics();
        drawCrystal(icon, label.x - label.width / 2 - px(20), ry, px(28));
        overlay.add([icon, label]);
      }

      buttons.forEach((b, i) => {
        const button = new Button(scene, w / 2, py0 + top + bh / 2 + i * (bh + gap), {
          width: panelW - px(48),
          height: bh,
          onClick: b.onClick,
        });
        button.add(scene.add.text(0, 0, b.label, textStyle(20, COLORS.textDark)).setOrigin(0.5));
        overlay.add(button);
      });
    };

    overlay.setData('rebuild', build);
    build();
    overlay.setAlpha(0);
    scene.tweens.add({ targets: overlay, alpha: 1, duration: 160 });
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
