import * as Phaser from 'phaser';
import type { BuildingType } from '../config/balance';
import { BUILD_MENU, COLORS, HUD } from '../config/game';
import { buildCost } from '../core/sim/commands';
import type { NodeState } from '../core/sim/World';
import { t } from '../i18n/i18n';
import { Button } from './Button';
import { drawBuilding, drawCoin } from './icons';
import { px, textStyle } from './layout';

export type BuildChoice = { kind: 'build'; building: BuildingType } | { kind: 'upgrade' };

interface Entry {
  button: Button;
  cost: number | null;
}

const BUILDING_ORDER: readonly BuildingType[] = ['mine', 'barracks', 'tower'];

/**
 * Build options for the selected own node, shown as a strip in the bottom HUD bar.
 * The field never extends into that bar, so the menu never covers nodes.
 * Build options on an empty slot, a single upgrade button on an existing building.
 */
export class BuildMenu extends Phaser.GameObjects.Container {
  readonly nodeId: string;
  private readonly entries: Entry[] = [];

  constructor(scene: Phaser.Scene, node: NodeState, onChoose: (choice: BuildChoice) => void) {
    const w = scene.scale.width;
    const h = scene.scale.height;
    const barH = px(HUD.bottomBar);
    super(scene, w / 2, h - barH / 2);
    this.nodeId = node.id;

    const items: Array<{ choice: BuildChoice | null; label: string; icon: BuildingType; cost: number | null }> = [];
    if (node.building) {
      const cost = buildCost(node.building.level);
      items.push({
        choice: cost === null ? null : { kind: 'upgrade' },
        label: cost === null ? t('build.maxLevel') : t('build.upgrade', { level: node.building.level + 1 }),
        icon: node.building.type,
        cost,
      });
    } else {
      for (const type of BUILDING_ORDER) {
        if (type === 'mine' && !node.hasGoldVein) continue;
        items.push({ choice: { kind: 'build', building: type }, label: t(`building.${type}`), icon: type, cost: buildCost(0) });
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
      const button = new Button(scene, x, 0, {
        width: bw,
        height: bh,
        onClick: () => {
          if (item.choice) onChoose(item.choice);
        },
      });

      // Top row: icon + name. Bottom row: coin + cost (absent at max level).
      const topY = item.cost === null ? 0 : -bh * 0.18;
      const iconSize = bh * 0.4;
      const label = scene.add.text(0, topY, item.label, textStyle(14, COLORS.textDark)).setOrigin(0, 0.5);
      const rowContentW = iconSize + px(4) + label.width;
      const left = -rowContentW / 2;
      const icon = scene.add.graphics();
      drawBuilding(icon, item.icon, left + iconSize / 2, topY, iconSize);
      label.setX(left + iconSize + px(4));
      button.add([icon, label]);

      if (item.cost !== null) {
        const costY = bh * 0.2;
        const coinSize = px(15);
        const cost = scene.add.text(0, costY, String(item.cost), textStyle(15, COLORS.textDark)).setOrigin(0, 0.5);
        const costW = coinSize + px(4) + cost.width;
        const coin = scene.add.graphics();
        drawCoin(coin, -costW / 2 + coinSize / 2, costY, coinSize);
        cost.setX(-costW / 2 + coinSize + px(4));
        button.add([coin, cost]);
      }

      if (!item.choice) button.setEnabled(false);
      this.add(button);
      this.entries.push({ button, cost: item.choice ? item.cost : null });
    });

    // Slide up from below the screen edge.
    const targetY = this.y;
    this.y = targetY + barH;
    scene.tweens.add({ targets: this, y: targetY, duration: 140, ease: 'Back.Out' });
    scene.add.existing(this);
  }

  /** Enables only affordable options. */
  refresh(gold: number): void {
    for (const entry of this.entries) {
      if (entry.cost !== null) entry.button.setEnabled(gold >= entry.cost);
    }
  }
}
