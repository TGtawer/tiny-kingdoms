import * as Phaser from 'phaser';
import type { BuildingType } from '../config/balance';
import { BUILD_MENU, COLORS } from '../config/game';
import { buildCost } from '../core/sim/commands';
import type { NodeState } from '../core/sim/World';
import { t } from '../i18n/i18n';
import { Button } from './Button';
import { drawBuilding, drawCoin } from './icons';
import { clamp, px, textStyle } from './layout';

export type BuildChoice = { kind: 'build'; building: BuildingType } | { kind: 'upgrade' };

interface Entry {
  button: Button;
  cost: number | null;
}

const BUILDING_ORDER: readonly BuildingType[] = ['mine', 'barracks', 'tower'];

/** Pop-up next to an own node: build options on an empty slot, upgrade on an existing building. */
export class BuildMenu extends Phaser.GameObjects.Container {
  readonly nodeId: string;
  private readonly entries: Entry[] = [];

  constructor(
    scene: Phaser.Scene,
    node: NodeState,
    anchor: { x: number; y: number; radius: number },
    onChoose: (choice: BuildChoice) => void,
  ) {
    super(scene, 0, 0);
    this.nodeId = node.id;

    const bw = px(BUILD_MENU.buttonWidth);
    const bh = px(BUILD_MENU.buttonHeight);
    const gap = px(BUILD_MENU.gap);
    const pad = px(BUILD_MENU.padding);

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

    const panelW = bw + pad * 2;
    const panelH = items.length * bh + (items.length - 1) * gap + pad * 2;
    const panel = scene.add.graphics();
    panel.fillStyle(COLORS.outline, 0.35).fillRoundedRect(-panelW / 2 + px(3), -panelH / 2 + px(4), panelW, panelH, px(16));
    panel.fillStyle(COLORS.panel, 1).fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, px(16));
    panel.lineStyle(px(3), COLORS.panelEdge, 1).strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, px(16));
    this.add(panel);

    items.forEach((item, i) => {
      const y = -panelH / 2 + pad + bh / 2 + i * (bh + gap);
      const button = new Button(scene, 0, y, {
        width: bw,
        height: bh,
        onClick: () => {
          if (item.choice) onChoose(item.choice);
        },
      });
      const icon = scene.add.graphics();
      drawBuilding(icon, item.icon, -bw / 2 + bh * 0.45, 0, bh * 0.55);
      const label = scene.add
        .text(-bw / 2 + bh * 0.85, item.cost === null ? 0 : -bh * 0.17, item.label, textStyle(14, COLORS.textDark))
        .setOrigin(0, 0.5);
      button.add([icon, label]);
      if (item.cost !== null) {
        const coin = scene.add.graphics();
        drawCoin(coin, -bw / 2 + bh * 0.85 + px(8), bh * 0.2, px(15));
        const cost = scene.add
          .text(-bw / 2 + bh * 0.85 + px(20), bh * 0.2, String(item.cost), textStyle(15, COLORS.textDark))
          .setOrigin(0, 0.5);
        button.add([coin, cost]);
      }
      if (!item.choice) button.setEnabled(false);
      this.add(button);
      this.entries.push({ button, cost: item.choice ? item.cost : null });
    });

    // Place to the right of the node, or to the left if it does not fit; keep on screen.
    const screenW = scene.scale.width;
    const screenH = scene.scale.height;
    const side = anchor.x + anchor.radius + panelW + px(8) <= screenW ? 1 : -1;
    const x = anchor.x + side * (anchor.radius + px(10) + panelW / 2);
    this.setPosition(
      clamp(x, panelW / 2 + px(4), screenW - panelW / 2 - px(4)),
      clamp(anchor.y, panelH / 2 + px(4), screenH - panelH / 2 - px(4)),
    );

    this.setScale(0.85);
    scene.tweens.add({ targets: this, scale: 1, duration: 120, ease: 'Back.Out' });
    scene.add.existing(this);
  }

  /** Enables only affordable options. */
  refresh(gold: number): void {
    for (const entry of this.entries) {
      if (entry.cost !== null) entry.button.setEnabled(gold >= entry.cost);
    }
  }
}
