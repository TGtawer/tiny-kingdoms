import * as Phaser from 'phaser';
import { BUILDINGS, type BuildingType } from '../config/balance';
import { BUILD_BUTTON, BUILD_MENU, COLORS, HUD, cssColor } from '../config/game';
import type { BuildButtonStyle } from '../core/meta/buildButtonStyle';
import { buildCost } from '../core/sim/commands';
import type { NodeState } from '../core/sim/World';
import { t } from '../i18n/i18n';
import { Button, type ButtonFace } from './Button';
import { toast } from './effects';
import { drawGoldFill } from './goldFill';
import { drawBuilding, drawCoin, drawLock } from './icons';
import { px, textStyle } from './layout';
import { playSfx } from './sound';

export type BuildChoice = { kind: 'build'; building: BuildingType } | { kind: 'upgrade' };

interface Entry {
  button: Button;
  /** The building this button builds (null for the upgrade button). */
  building: BuildingType | null;
  /** Price of a button that can be chosen (null: locked or max level — no price, no affordability look). */
  cost: number | null;
  label: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Graphics;
  desc: Phaser.GameObjects.Text | null;
  coin: Phaser.GameObjects.Graphics | null;
  costText: Phaser.GameObjects.Text | null;
  shownCost: string;
  /** Position in the row; a shake moves the button around it. */
  baseX: number;
  /** null until the first refresh, so opening the menu with enough gold doesn't pop. */
  affordable: boolean | null;
  /** `fill` look: the gold share drawn on the face, and the whole gold it was drawn for. */
  fillShare: number;
  shownGold: number;
  face: ButtonFace | null;
  shake: Phaser.Tweens.Tween | null;
  pop: Phaser.Tweens.Tween | null;
}

const BUILDING_ORDER: readonly BuildingType[] = ['mine', 'barracks', 'tower'];

/** Value at `v` (0..1) of keys spread evenly over 0..1, linear in between. */
function keyframe(keys: readonly number[], v: number): number {
  const at = Math.min(Math.max(v, 0), 1) * (keys.length - 1);
  const i = Math.min(Math.floor(at), keys.length - 2);
  return keys[i]! + (keys[i + 1]! - keys[i]!) * (at - i);
}

/**
 * Build options for the selected own node, shown as a strip in the bottom HUD bar.
 * The field never extends into that bar, so the menu never covers nodes.
 * Build options on an empty slot, a single upgrade button on an existing building.
 * Buildings not taught yet (TUTORIAL.md T-3) stay in the row, dark with a lock; a tap says when they open.
 * A button always shows its price (docs/BUILD-BUTTON.md BB-3). Without enough gold it looks unaffordable
 * (`style`: grey, or filling with gold), a tap shakes it and builds nothing; when the gold first covers the
 * price it pops with a sound.
 */
export class BuildMenu extends Phaser.GameObjects.Container {
  readonly nodeId: string;
  private readonly entries: Entry[] = [];
  private readonly style: BuildButtonStyle;
  private gold = 0;

  /** `lockHint`: null if the building can be built, otherwise the "opens at level N" text. */
  constructor(
    scene: Phaser.Scene,
    node: NodeState,
    onChoose: (choice: BuildChoice) => void,
    lockHint: (type: BuildingType) => string | null = () => null,
    style: BuildButtonStyle = BUILD_BUTTON.style,
  ) {
    const w = scene.scale.width;
    const h = scene.scale.height;
    const barH = px(HUD.bottomBar);
    super(scene, w / 2, h - barH / 2);
    this.nodeId = node.id;
    this.style = style;

    const items: Array<{
      choice: BuildChoice | null;
      label: string;
      desc: string;
      icon: BuildingType;
      cost: number | null;
      locked?: string;
    }> = [];
    if (node.building) {
      const cost = buildCost(node.building.level);
      items.push({
        choice: cost === null ? null : { kind: 'upgrade' },
        label: cost === null ? t('build.maxLevel') : t('build.upgrade', { level: node.building.level + 1 }),
        desc: cost === null ? '' : nextLevelEffect(node.building.type, node.building.level + 1),
        icon: node.building.type,
        cost,
      });
    } else {
      for (const type of BUILDING_ORDER) {
        if (type === 'mine' && !node.hasGoldVein) continue;
        const locked = lockHint(type);
        items.push({
          choice: locked === null ? { kind: 'build', building: type } : null,
          label: t(`building.${type}`),
          desc: t(`building.${type}.desc`),
          icon: type,
          cost: locked === null ? buildCost(0) : null,
          ...(locked === null ? {} : { locked }),
        });
      }
    }

    // Strip across the whole bar: hides the spell bar area behind it.
    const strip = scene.add.graphics();
    strip.fillStyle(COLORS.outline, 0.35).fillRect(-w / 2, -barH / 2, w, barH);
    strip.lineStyle(px(3), COLORS.panelEdge, 1).lineBetween(-w / 2, -barH / 2, w / 2, -barH / 2);
    this.add(strip);

    const gap = px(BUILD_MENU.gap);
    const margin = px(BUILD_MENU.padding);
    const n = items.length;
    const maxW = px(n === 1 ? BUILD_MENU.singleButtonWidth : BUILD_MENU.buttonWidth);
    const bw = Math.min(maxW, (w - 2 * margin - (n - 1) * gap) / n);
    const bh = Math.min(px(BUILD_MENU.buttonHeight), barH - 2 * px(BUILD_MENU.barInset));
    const rowW = n * bw + (n - 1) * gap;

    items.forEach((item, i) => {
      const x = -rowW / 2 + bw / 2 + i * (bw + gap);
      const locked = item.locked;
      let entry: Entry | null = null;
      const button = new Button(scene, x, 0, {
        width: bw,
        height: bh,
        ...(locked !== undefined ? { color: COLORS.locked } : {}),
        onClick: () => {
          if (locked !== undefined) {
            // One hint at a time, centered: hints are wider than the buttons (BB-2).
            toast(scene, scene.scale.width / 2, this.y - bh / 2 - px(8), locked);
            return;
          }
          if (!item.choice || item.cost === null) return;
          if (this.gold >= item.cost) onChoose(item.choice);
          else if (entry) this.shake(entry);
        },
      });

      // Rows: icon + name, effect, coin + cost (only the name at max level); locked: icon + name, lock.
      const topY = item.cost === null && locked === undefined ? 0 : -bh * 0.27;
      const iconSize = bh * 0.32;
      const label = scene.add.text(0, topY, item.label, textStyle(14, locked !== undefined ? COLORS.text : COLORS.textDark)).setOrigin(0, 0.5);
      const rowContentW = iconSize + px(4) + label.width;
      const left = -rowContentW / 2;
      const icon = scene.add.graphics();
      drawBuilding(icon, item.icon, left + iconSize / 2, topY, iconSize);
      label.setX(left + iconSize + px(4));
      button.add([icon, label]);
      if (locked !== undefined) {
        icon.setAlpha(0.6);
        const lock = scene.add.graphics();
        drawLock(lock, 0, bh * 0.14, bh * 0.36);
        lock.setAlpha(0.9);
        // drawLock paints in the dark text color; a light disc behind keeps it visible on the dark face.
        const disc = scene.add.graphics();
        disc.fillStyle(COLORS.panel, 0.85).fillCircle(0, bh * 0.14, bh * 0.22);
        button.add([disc, lock]);
      }

      let costText: Phaser.GameObjects.Text | null = null;
      let desc: Phaser.GameObjects.Text | null = null;
      let coin: Phaser.GameObjects.Graphics | null = null;
      if (item.cost !== null) {
        desc = scene.add.text(0, 0, item.desc, textStyle(12, COLORS.textDark)).setOrigin(0.5).setAlpha(0.8);
        const costY = bh * 0.25;
        const coinSize = px(14);
        costText = scene.add.text(0, costY, String(item.cost), textStyle(14, COLORS.textDark)).setOrigin(0.5);
        coin = scene.add.graphics();
        drawCoin(coin, 0, 0, coinSize);
        coin.setPosition(0, costY).setName('coin');
        button.add([desc, coin, costText]);
      }

      // Max level: nothing to do. Locked buttons stay enabled so a tap can explain when they open.
      if (!item.choice && locked === undefined) button.setEnabled(false);
      this.add(button);
      entry = {
        button,
        building: node.building ? null : item.icon,
        cost: item.choice ? item.cost : null,
        label,
        icon,
        desc,
        coin,
        costText,
        shownCost: '',
        baseX: x,
        affordable: null,
        fillShare: 0,
        shownGold: -1,
        face: null,
        shake: null,
        pop: null,
      };
      this.entries.push(entry);
      this.placeCost(entry, String(item.cost ?? ''));
    });

    // Slide up from below the screen edge.
    const targetY = this.y;
    this.y = targetY + barH;
    scene.tweens.add({ targets: this, y: targetY, duration: 140, ease: 'Back.Out' });
    scene.add.existing(this);
  }

  /** Screen position of the button that builds `type` (for tutorial highlights); null if it is not in the menu. */
  buttonPosition(type: BuildingType): { x: number; y: number } | null {
    const entry = this.entries.find((e) => e.building === type);
    // The row position, not the shaken one.
    return entry ? { x: this.x + entry.baseX, y: this.y + entry.button.y } : null;
  }

  /** Follows the player's gold: the affordability look, the `fill` share, and a pop when a price is reached. */
  refresh(gold: number): void {
    this.gold = gold;
    for (const entry of this.entries) {
      if (entry.cost === null) continue;
      const affordable = gold >= entry.cost;
      if (affordable !== entry.affordable) {
        const reached = entry.affordable === false && affordable;
        entry.affordable = affordable;
        entry.shownGold = -1;
        this.applyLook(entry);
        if (reached) this.pop(entry);
      }
      if (this.style === 'fill' && !affordable) {
        const whole = Math.floor(gold);
        if (whole !== entry.shownGold) {
          entry.shownGold = whole;
          entry.fillShare = Math.max(0, whole / entry.cost);
          entry.button.setFace(entry.face);
          this.placeCost(entry, `${whole} / ${entry.cost}`);
        }
      } else {
        this.placeCost(entry, String(entry.cost));
      }
    }
  }

  override destroy(fromScene?: boolean): void {
    for (const entry of this.entries) {
      entry.shake?.stop();
      entry.pop?.stop();
    }
    super.destroy(fromScene);
  }

  /** Redraws an entry for its affordability (only when it changes, not every frame). */
  private applyLook(entry: Entry): void {
    const can = entry.affordable !== false;
    const dark = cssColor(COLORS.textDark);
    if (this.style === 'grey') {
      const G = BUILD_BUTTON.grey;
      entry.face = can ? null : { color: COLORS.buttonDisabled, shine: false };
      entry.icon.setAlpha(can ? 1 : G.iconAlpha);
      entry.coin?.setAlpha(can ? 1 : G.coinAlpha);
      const text = can ? dark : cssColor(G.text);
      entry.label.setColor(text);
      entry.desc?.setColor(text);
      entry.costText?.setColor(can ? dark : cssColor(G.price));
    } else {
      const F = BUILD_BUTTON.fill;
      entry.face = can
        ? null
        : {
            color: F.face,
            shine: false,
            decor: (g, left, top, w, h, r) => drawGoldFill(g, left, top, w, h, r, entry.fillShare, F),
          };
      // Name, effect and price share one color, readable on the gold and on the empty part alike.
      const text = can ? dark : cssColor(F.text);
      entry.label.setColor(text);
      entry.desc?.setColor(text);
      entry.costText?.setColor(text);
    }
    entry.button.setFace(entry.face);
  }

  /** Shakes an unaffordable button around its row position; a new tap restarts the shake. */
  private shake(entry: Entry): void {
    const S = BUILD_BUTTON.shake;
    const button = entry.button;
    entry.shake?.stop();
    button.x = entry.baseX;
    entry.shake = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: S.ms,
      onUpdate: (tween) => {
        button.x = entry.baseX + keyframe(S.keys, tween.getValue() ?? 1) * px(S.distance);
      },
      onComplete: () => {
        button.x = entry.baseX;
        entry.shake = null;
      },
      onStop: () => {
        button.x = entry.baseX;
      },
    });
  }

  /** The gold just reached the price: a short grow-and-back and a sound. */
  private pop(entry: Entry): void {
    const R = BUILD_BUTTON.ready;
    const button = entry.button;
    entry.pop?.stop();
    entry.pop = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: R.popMs,
      onUpdate: (tween) => {
        const v = tween.getValue() ?? 1;
        const k = v < R.peakAt ? v / R.peakAt : (1 - v) / (1 - R.peakAt);
        button.setScale(1 + (R.popScale - 1) * Math.sin((k * Math.PI) / 2));
      },
      onComplete: () => {
        button.setScale(1);
        entry.pop = null;
      },
      onStop: () => {
        button.setScale(1);
      },
    });
    playSfx('ready');
  }

  /** Sets the cost label and centers the coin + label pair. */
  private placeCost(entry: Entry, text: string): void {
    const label = entry.costText;
    if (!label || entry.shownCost === text) return;
    entry.shownCost = text;
    label.setText(text);
    const coinSize = px(14);
    const total = coinSize + px(4) + label.width;
    entry.coin?.setX(-total / 2 + coinSize / 2);
    label.setX(-total / 2 + coinSize + px(4) + label.width / 2);
  }
}

/** One-line effect of a building at `level` (for the upgrade button). */
function nextLevelEffect(type: BuildingType, level: number): string {
  const i = level - 1;
  switch (type) {
    case 'mine':
      return t('build.next.mine', { gold: BUILDINGS.mine.extraGoldPerSec[i] ?? 0 });
    case 'barracks':
      return t('build.next.barracks', {
        mult: BUILDINGS.barracks.productionMult[i] ?? 1,
        cap: BUILDINGS.barracks.extraCapacity[i] ?? 0,
      });
    case 'tower':
      return t('build.next.tower', { shots: BUILDINGS.tower.shotsPerSec[i] ?? 0 });
  }
}
