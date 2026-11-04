import * as Phaser from 'phaser';
import { BONUSES, SPELL_UPGRADES, SPELL_IDS, type SpellId } from '../config/balance';
import { COLORS } from '../config/game';
import { BONUS_IDS, type BonusId } from '../core/meta/Progress';
import { activeSpell, canOpenSpell, nextSlotStars, openSpell, setActiveSpell } from '../core/meta/spellbook';
import { freeStars, totalStars } from '../core/meta/stars';
import { bonusCost, buyBonus, buySpellUpgrade, spellUpgradeCost } from '../core/meta/upgrades';
import { t } from '../i18n/i18n';
import { Button } from '../view/Button';
import { drawCrystal, drawLock, drawStar } from '../view/icons';
import { px, textStyle } from '../view/layout';
import { drawMeadow, topBar } from '../view/ui';
import { getStore } from './registry';

export interface UpgradesData {
  /** Scene to return to. */
  from?: 'MenuScene' | 'ChapterMapScene';
}

interface Row {
  title: string;
  desc: string;
  level: number;
  max: number;
  /** null = max level reached. */
  cost: number | null;
  /** Shown instead of the buy button when the item is locked. */
  locked?: string;
  /** What the cost is paid in, and how much of it the player has. */
  currency: 'crystal' | 'star';
  balance: number;
  buy: () => void;
  /** Spell not open yet but a slot is free: an "Open" button replaces the buy button. */
  open?: () => void;
  /** Open spells: a radio mark at the left; tapping the row makes the spell active. */
  spell?: { active: boolean; select: () => void };
}

const ROW_H = 64;
const HEADER_H = 30;

/** Permanent bonuses bought with crystals and spell upgrades bought with stars (GDD 4.3, BALANCE.md). */
export class UpgradesScene extends Phaser.Scene {
  private from: 'MenuScene' | 'ChapterMapScene' = 'MenuScene';

  constructor() {
    super('UpgradesScene');
  }

  init(data: UpgradesData): void {
    this.from = data.from ?? 'MenuScene';
  }

  create(): void {
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this));
  }

  private build(): void {
    this.children.removeAll(true);
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    drawMeadow(this.add.graphics(), w, h);

    const store = getStore(this);
    const progress = store.progress;
    const barH = topBar(this, t('upgrades.title'), progress.crystals, () => this.scene.start(this.from));

    const afterBuy = (ok: boolean): void => {
      if (!ok) return;
      store.commit();
      this.build();
    };

    const per = BONUSES.perLevel;
    const bonusValue: Record<BonusId, number> = {
      startArmy: per.startArmy,
      troopProduction: Math.round(per.troopProduction * 100),
      goldIncome: Math.round(per.goldIncome * 100),
      unitStrength: Math.round(per.unitStrength * 100),
    };
    const bonusRows: Row[] = BONUS_IDS.map((id) => ({
      title: t(`bonus.${id}`),
      desc: t(`bonus.${id}.desc`, { value: bonusValue[id] }),
      level: progress.bonuses[id],
      max: BONUSES.maxLevel,
      cost: bonusCost(progress.bonuses[id]),
      currency: 'crystal',
      balance: progress.crystals,
      buy: () => afterBuy(buyBonus(progress, id) === 'ok'),
    }));

    const earned = totalStars(progress);
    const free = freeStars(progress);
    const active = activeSpell(progress);
    const slotFree = canOpenSpell(progress);
    const nextSlot = nextSlotStars(progress);
    const lockedText = nextSlot === null ? t('upgrades.noSlot') : t('upgrades.nextSlot', { need: nextSlot, have: earned });
    const spellRows: Row[] = SPELL_IDS.map((id: SpellId) => {
      const s = SPELL_UPGRADES.perLevel;
      const desc =
        id === 'fireball'
          ? t('spell.fireball.desc', { damage: Math.round(s.fireball.damageShare * 100), cooldown: -s.fireball.cooldownSec })
          : id === 'reinforcement'
            ? t('spell.reinforcement.desc', { troops: s.reinforcement.troops, cooldown: -s.reinforcement.cooldownSec })
            : t('spell.shield.desc', { sec: s.shield.durationSec, cooldown: -s.shield.cooldownSec });
      const isOpen = progress.openSpells.includes(id);
      return {
        title: t(`spell.${id}`),
        desc,
        level: progress.spellUpgrades[id],
        max: SPELL_UPGRADES.maxLevel,
        cost: spellUpgradeCost(progress.spellUpgrades[id]),
        currency: 'star',
        balance: free,
        ...(isOpen ? { spell: { active: id === active, select: () => afterBuy(id !== active && setActiveSpell(progress, id)) } } : {}),
        ...(!isOpen && slotFree ? { open: () => afterBuy(openSpell(progress, id) === 'ok') } : {}),
        ...(!isOpen && !slotFree ? { locked: lockedText } : {}),
        buy: () => afterBuy(buySpellUpgrade(progress, id) === 'ok'),
      };
    });

    // Rows shrink a little on short screens so everything fits without scrolling.
    const listW = Math.min(w - px(24), px(560));
    const rows = bonusRows.length + spellRows.length;
    const needed = px(HEADER_H) * 2 + rows * px(ROW_H) + px(16);
    const scale = Math.min(1, (h - barH - px(12)) / needed);
    const rowH = px(ROW_H) * scale;
    const headerH = px(HEADER_H) * scale;
    let y = barH + px(10);
    const x0 = w / 2 - listW / 2;

    const header = (text: string, stars?: number): void => {
      this.add.text(x0 + px(6), y + headerH / 2, text, textStyle(16)).setOrigin(0, 0.5).setStroke('#1f2937', px(4));
      // Free stars at the right end of the spell header.
      if (stars !== undefined) {
        const right = x0 + listW - px(6);
        const count = this.add.text(right, y + headerH / 2, String(stars), textStyle(18)).setOrigin(1, 0.5).setStroke('#1f2937', px(4));
        drawStar(this.add.graphics(), right - count.width - px(13), y + headerH / 2, px(22), true);
      }
      y += headerH;
    };
    const row = (r: Row): void => {
      this.drawRow(r, x0, y, listW, rowH - px(6));
      y += rowH;
    };

    header(t('upgrades.bonuses'));
    bonusRows.forEach(row);
    header(slotFree ? t('upgrades.spellsChoose') : t('upgrades.spells'), free);
    spellRows.forEach(row);
  }

  private drawRow(r: Row, x: number, y: number, width: number, height: number): void {
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panel, r.locked ? 0.7 : 1).fillRoundedRect(x, y, width, height, px(12));
    const active = r.spell?.active === true;
    panel.lineStyle(px(active ? 4 : 2.5), active ? COLORS.gold : COLORS.panelEdge, 1).strokeRoundedRect(x, y, width, height, px(12));

    const buttonW = px(104);
    // Open spells get a radio mark; the whole row left of the button selects the spell.
    const radio = r.spell ? px(30) : 0;
    const textX = x + px(12) + radio;
    const textW = width - buttonW - px(36) - radio;
    if (r.spell) {
      const mark = this.add.graphics();
      const mx = x + px(12) + px(11);
      mark.lineStyle(px(2.5), COLORS.textDark, 1).strokeCircle(mx, y + height / 2, px(11));
      if (active) mark.fillStyle(COLORS.gold, 1).fillCircle(mx, y + height / 2, px(7));
      const select = r.spell.select;
      this.add
        .zone(x, y, width - buttonW - px(16), height)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, select);
    }
    const nameSize = height < px(50) ? 14 : 16;
    const name = this.add
      .text(textX, y + height * 0.3, `${r.title}  ${t('upgrades.level', { level: r.level, max: r.max })}`, textStyle(nameSize, COLORS.textDark))
      .setOrigin(0, 0.5);
    // Long names (narrow portrait) shrink instead of running under the buy button.
    if (name.width > textW) name.setScale(textW / name.width);
    const desc = this.add
      .text(textX, y + height * 0.7, r.locked ?? r.desc, textStyle(nameSize - 3, COLORS.textDark))
      .setOrigin(0, 0.5)
      .setAlpha(0.8);
    // The effect line stays on one line (shrinks); the longer lock hint wraps.
    if (r.locked) desc.setWordWrapWidth(textW, true);
    else if (desc.width > textW) desc.setScale(textW / desc.width);

    const bx = x + width - buttonW / 2 - px(8);
    const by = y + height / 2;
    if (r.locked) {
      const lock = this.add.graphics();
      drawLock(lock, bx, by, px(26));
      return;
    }
    if (r.open) {
      const openButton = new Button(this, bx, by, { width: buttonW, height: Math.max(px(48), height - px(10)), onClick: r.open });
      openButton.add(this.add.text(0, -px(2), t('upgrades.open'), textStyle(16, COLORS.textDark)).setOrigin(0.5));
      return;
    }
    const button = new Button(this, bx, by, { width: buttonW, height: Math.max(px(48), height - px(10)), onClick: r.buy });
    if (r.cost === null) {
      button.add(this.add.text(0, -px(2), t('upgrades.max'), textStyle(16, COLORS.textDark)).setOrigin(0.5));
      button.setEnabled(false);
      return;
    }
    const icon = this.add.graphics();
    if (r.currency === 'star') drawStar(icon, -px(22), -px(2), px(22), true);
    else drawCrystal(icon, -px(22), -px(2), px(20));
    button.add([icon, this.add.text(-px(8), -px(2), String(r.cost), textStyle(17, COLORS.textDark)).setOrigin(0, 0.5)]);
    button.setEnabled(r.balance >= r.cost);
  }
}
