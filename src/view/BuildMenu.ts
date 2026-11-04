import * as Phaser from 'phaser';
import { BUILDINGS, type BuildingType } from '../config/balance';
import { BUILD_MENU, COLORS, HUD } from '../config/game';
import { buildCost } from '../core/sim/commands';
import type { NodeState } from '../core/sim/World';
import { t } from '../i18n/i18n';
import { Button } from './Button';
import { toast } from './effects';
import { drawBuilding, drawCoin, drawLock } from './icons';
import { px, textStyle } from './layout';

export type BuildChoice = { kind: 'build'; building: BuildingType } | { kind: 'upgrade' };

interface Entry {
  button: Button;
  cost: number | null;
  costText: Phaser.GameObjects.Text | null;
  shownCost: string;
}

const BUILDING_ORDER: readonly BuildingType[] = ['mine', 'barracks', 'tower'];

/**
 * Build options for the selected own node, shown as a strip in the bottom HUD bar.
 * The field never extends into that bar, so the menu never covers nodes.
 * Build options on an empty slot, a single upgrade button on an existing building.
 * Buildings not taught yet (TUTORIAL.md T-3) stay in the row, dark with a lock; a tap says when they open.
 */
export class BuildMenu extends Phaser.GameObjects.Container {
  readonly nodeId: string;
  private readonly entries: Entry[] = [];
  private gold = 0;

  /** `lockHint`: null if the building can be built, otherwise the "opens at level N" text. */
  constructor(
    scene: Phaser.Scene,
    node: NodeState,
    onChoose: (choice: BuildChoice) => void,
    lockHint: (type: BuildingType) => string | null = () => null,
  ) {
    const w = scene.scale.width;
    const h = scene.scale.height;
    const barH = px(HUD.bottomBar);
    super(scene, w / 2, h - barH / 2);
    this.nodeId = node.id;

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
      const button = new Button(scene, x, 0, {
        width: bw,
        height: bh,
        ...(locked !== undefined ? { color: COLORS.locked } : {}),
        onClick: () => {
          if (locked !== undefined) {
            toast(scene, this.x + x, this.y - bh / 2 - px(8), locked);
            return;
          }
          // Not affordable: the button stays bright and says how much is missing, but does nothing.
          if (item.choice && item.cost !== null && this.gold >= item.cost) onChoose(item.choice);
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
      if (item.cost !== null) {
        const desc = scene.add.text(0, 0, item.desc, textStyle(12, COLORS.textDark)).setOrigin(0.5).setAlpha(0.8);
        const costY = bh * 0.25;
        const coinSize = px(14);
        costText = scene.add.text(0, costY, String(item.cost), textStyle(14, COLORS.textDark)).setOrigin(0.5);
        const coin = scene.add.graphics();
        drawCoin(coin, 0, 0, coinSize);
        coin.setPosition(0, costY).setName('coin');
        button.add([desc, coin, costText]);
      }

      // Max level: nothing to do. Locked buttons stay enabled so a tap can explain when they open.
      if (!item.choice && locked === undefined) button.setEnabled(false);
      this.add(button);
      const entry: Entry = { button, cost: item.choice ? item.cost : null, costText, shownCost: '' };
      this.entries.push(entry);
      this.placeCost(entry, String(item.cost ?? ''));
    });

    // Slide up from below the screen edge.
    const targetY = this.y;
    this.y = targetY + barH;
    scene.tweens.add({ targets: this, y: targetY, duration: 140, ease: 'Back.Out' });
    scene.add.existing(this);
  }

  /** Shows the price of affordable options and "N more" for the others. */
  refresh(gold: number): void {
    this.gold = gold;
    for (const entry of this.entries) {
      if (entry.cost === null) continue;
      const missing = Math.ceil(entry.cost - gold);
      this.placeCost(entry, missing > 0 ? t('build.needMore', { n: missing }) : String(entry.cost));
    }
  }

  /** Sets the cost label and centers the coin + label pair. */
  private placeCost(entry: Entry, text: string): void {
    const label = entry.costText;
    if (!label || entry.shownCost === text) return;
    entry.shownCost = text;
    label.setText(text);
    const coin = entry.button.getByName('coin') as Phaser.GameObjects.Graphics | null;
    const coinSize = px(14);
    const total = coinSize + px(4) + label.width;
    coin?.setX(-total / 2 + coinSize / 2);
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
      return t('build.next.tower', { damage: BUILDINGS.tower.damage[i] ?? 0 });
  }
}
