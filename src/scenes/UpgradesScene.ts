import * as Phaser from 'phaser';
import { BONUSES, SPELLS, SPELL_UPGRADES, SPELL_IDS, type SpellId } from '../config/balance';
import { COLORS, HUD } from '../config/game';
import type { BonusId } from '../core/meta/Progress';
import { activeSpell, claimableSpell, setActiveSpell, spellUnlockLevel, unlockSpell } from '../core/meta/spellbook';
import { advanceTour, claimTourSpell, tourStep } from '../core/meta/onboarding';
import { freeStars } from '../core/meta/stars';
import { bonusCost, buyBonus, buySpellUpgrade, OFFERED_BONUS_IDS, spellUpgradeCost } from '../core/meta/upgrades';
import { t } from '../i18n/i18n';
import { Button } from '../view/Button';
import { drawCrystal, drawLock, drawStar } from '../view/icons';
import { px, textStyle } from '../view/layout';
import { mapTrack } from '../core/audio/playlist';
import { audioFiles, playMusic } from '../view/music';
import { ringBurst, sparks } from '../view/effects';
import { Spotlight, type SpotRect } from '../view/Spotlight';
import { drawMeadow, topBar } from '../view/ui';
import { getLevel } from '../levels';
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
  /** A spell the story has given but the player has not claimed yet: an "Open" button replaces the buy button. */
  open?: () => void;
  /** Unlocked spells: a radio mark at the left; tapping the row makes the spell active. */
  spell?: { active: boolean; select: () => void };
}

const ROW_H = 64;

/** What a spell does (its level 1 numbers), for spells the player has not unlocked yet. */
function spellAbout(id: SpellId): string {
  switch (id) {
    case 'fireball':
      return t('spell.fireball.about', { share: Math.round(SPELLS.fireball.killShare * 100) });
    case 'reinforcement':
      return t('spell.reinforcement.about', { troops: SPELLS.reinforcement.troops });
    case 'shield':
      return t('spell.shield.about', { sec: SPELLS.shield.durationSec });
  }
}
const HEADER_H = 30;

/** Permanent bonuses bought with crystals and spell upgrades bought with stars (GDD 4.3, BALANCE.md). */
export class UpgradesScene extends Phaser.Scene {
  private from: 'MenuScene' | 'ChapterMapScene' = 'MenuScene';
  /** Upgrades tour steps 2–5 (TUTORIAL.md T-6). */
  private spotlight: Spotlight | null = null;
  /** Where the tour points, recorded while building the screen. */
  private areas: { crystals: SpotRect; spells: SpotRect; claim: SpotRect | null; back: SpotRect } | null = null;
  /** Set when the tour spell was just claimed: the unlock burst plays there after the rebuild. */
  private burstAt: { x: number; y: number } | null = null;

  constructor() {
    super('UpgradesScene');
  }

  init(data: UpgradesData): void {
    this.from = data.from ?? 'MenuScene';
  }

  create(): void {
    // Same track as the chapter map: map ↔ upgrades keeps playing from the same place.
    playMusic(mapTrack(audioFiles()));
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this));
  }

  private build(): void {
    this.spotlight?.destroy();
    this.spotlight = null;
    this.children.removeAll(true);
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    drawMeadow(this.add.graphics(), w, h);

    const store = getStore(this);
    const progress = store.progress;
    // Reached from the main menu during tour step 1: the Upgrades screen is where the tour goes on.
    if (advanceTour(progress, 1)) store.commit();
    const barH = topBar(this, t('upgrades.title'), progress.crystals, () => this.onBack());
    const backSize = px(HUD.pauseButton);

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
    // Unit strength is hidden: 1 unit = 1 unit with stream armies (GDD 4.3).
    const bonusRows: Row[] = OFFERED_BONUS_IDS.map((id) => ({
      title: t(`bonus.${id}`),
      desc: t(`bonus.${id}.desc`, { value: bonusValue[id] }),
      level: progress.bonuses[id],
      max: BONUSES.maxLevel,
      cost: bonusCost(progress.bonuses[id]),
      currency: 'crystal',
      balance: progress.crystals,
      buy: () => afterBuy(buyBonus(progress, id) === 'ok'),
    }));

    const free = freeStars(progress);
    const active = activeSpell(progress);
    const claimable = claimableSpell(progress);
    // Spells come from the story (TUTORIAL.md T-3): a locked one says after which level it opens.
    const lockedText = (id: SpellId): string => {
      const level = getLevel(spellUnlockLevel(id));
      return level?.chapter === 1 ? t('lock.afterLevel', { index: level.index }) : t('lock.later');
    };
    const spellRows: Row[] = SPELL_IDS.map((id: SpellId) => {
      const s = SPELL_UPGRADES.perLevel;
      const desc =
        id === 'fireball'
          ? t('spell.fireball.desc', { damage: Math.round(s.fireball.damageShare * 100), cooldown: -s.fireball.cooldownSec })
          : id === 'reinforcement'
            ? t('spell.reinforcement.desc', { troops: s.reinforcement.troops, cooldown: -s.reinforcement.cooldownSec })
            : t('spell.shield.desc', { sec: s.shield.durationSec, cooldown: -s.shield.cooldownSec });
      const isOpen = progress.unlockedSpells.includes(id);
      return {
        title: t(`spell.${id}`),
        desc: isOpen ? desc : spellAbout(id),
        level: progress.spellUpgrades[id],
        max: SPELL_UPGRADES.maxLevel,
        cost: spellUpgradeCost(progress.spellUpgrades[id]),
        currency: 'star',
        balance: free,
        ...(isOpen ? { spell: { active: id === active, select: () => afterBuy(id !== active && setActiveSpell(progress, id)) } } : {}),
        ...(!isOpen && id === claimable ? { open: () => this.claim(id) } : {}),
        ...(!isOpen && id !== claimable ? { locked: lockedText(id) } : {}),
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
    const spellsTop = y;
    header(t('upgrades.spells'), free);
    // The "Open" button of the claimable spell row (same place as in drawRow).
    const claimIndex = claimable ? SPELL_IDS.indexOf(claimable) : -1;
    const buttonW = px(104);
    const claimCy = y + claimIndex * rowH + (rowH - px(6)) / 2;
    const claimH = Math.max(px(48), rowH - px(16));
    const claim = claimIndex >= 0 ? { x: x0 + listW - buttonW - px(8), y: claimCy - claimH / 2, w: buttonW, h: claimH } : null;
    spellRows.forEach(row);

    this.areas = {
      crystals: { x: w - px(130), y: px(4), w: px(124), h: barH - px(8) },
      spells: { x: x0, y: spellsTop, w: listW, h: y - spellsTop },
      claim,
      back: { x: px(12), y: barH / 2 - backSize / 2, w: backSize, h: backSize },
    };
    this.showTour();
    if (this.burstAt) {
      const { x, y: by } = this.burstAt;
      this.burstAt = null;
      ringBurst(this, x, by, px(40), COLORS.reinforcement);
      sparks(this, x, by, COLORS.gold, 14, px(60), 700, px(5), 50);
    }
  }

  /** Back: to where the player came from; the last tour step goes to the chapter map and ends the tour. */
  private onBack(): void {
    const store = getStore(this);
    if (advanceTour(store.progress, 5)) {
      store.commit();
      this.scene.start('ChapterMapScene');
      return;
    }
    this.scene.start(this.from);
  }

  /** Claims a story spell (in the tour: unlocked and made active, with a burst). */
  private claim(spell: SpellId): void {
    const store = getStore(this);
    const claim = this.areas?.claim;
    const ok = claimTourSpell(store.progress) || unlockSpell(store.progress, spell);
    if (!ok) return;
    store.commit();
    if (claim) this.burstAt = { x: claim.x + claim.w / 2, y: claim.y + claim.h / 2 };
    this.build();
  }

  /** Spotlight for the current tour step (TUTORIAL.md T-6). */
  private showTour(): void {
    const store = getStore(this);
    const step = tourStep(store.progress);
    const areas = this.areas;
    if (!areas || step === null) return;
    const next = (from: 2 | 3): void => {
      if (advanceTour(store.progress, from)) store.commit();
      this.build();
    };
    const center = (r: SpotRect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    switch (step) {
      case 2:
        this.spotlight = new Spotlight(this, { hole: areas.crystals, text: t('tour.crystals'), onTapAnywhere: () => next(2) });
        break;
      case 3:
        this.spotlight = new Spotlight(this, { hole: areas.spells, text: t('tour.stars'), onTapAnywhere: () => next(3) });
        break;
      case 4: {
        const spell = claimableSpell(store.progress);
        if (!areas.claim || !spell) break;
        // Until the spell is claimed nothing else works, Back included.
        this.spotlight = new Spotlight(this, {
          hole: areas.claim,
          text: t('tour.claim', { spell: t(`spell.${spell}`) }),
          finger: center(areas.claim),
        });
        break;
      }
      case 5:
        this.spotlight = new Spotlight(this, { hole: areas.back, text: t('tour.done'), finger: center(areas.back) });
        break;
      default:
        break;
    }
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
