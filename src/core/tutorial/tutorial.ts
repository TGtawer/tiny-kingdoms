import { TICK_MS, TUTORIAL, type BuildingType, type SpellId } from '../../config/balance';
import type { LevelData } from '../level/schema';
import type { Progress } from '../meta/Progress';
import { activeSpell } from '../meta/spellbook';
import type { MageEvent } from '../sim/specials/mage';
import type { TickEvent } from '../sim/tick';
import type { World } from '../sim/World';

/**
 * Step-by-step tutorial (GDD 6, TUTORIAL.md T-4): one short hint at a time, highlights and a finger showing
 * the gesture. A step ends when the player does what it asks (or after a few seconds for info-only steps).
 * While a `slow` step waits for the player, the whole battle runs at SLOW_MO.speed (see sim/clock.ts).
 */

/** HUD elements a step can point at: the gold counter, the spell button, the goal plaque. */
export type UiAnchor = 'gold' | 'spell' | 'goal';

/** `bossTarget`: the node a boss has just marked (changes during the battle). */
export type TutorialAnchor = { node: string } | { ui: UiAnchor } | { build: BuildingType } | { bossTarget: true };

export type FingerHint =
  /** Swipe from `from` to `to`, or along `path` (own nodes, then the target) for a multi-node swipe. */
  | { kind: 'drag'; from: string; to: string }
  | { kind: 'drag'; path: string[] }
  | { kind: 'tap'; node: string }
  /** Tap on a HUD element. */
  | { kind: 'tapUi'; ui: UiAnchor };

/** Boss events a step can wait for (TUTORIAL.md T-7). */
export type SpecialEvent = MageEvent['type'];

export type StepCondition =
  /** `minSources`: one swipe from at least that many own nodes (one tick, one target). */
  | { type: 'send'; to?: string; minSources?: number }
  | { type: 'capture'; node?: string }
  | { type: 'build'; building?: BuildingType; node?: string }
  | { type: 'gold'; atLeast: number }
  | { type: 'time'; sec: number }
  /** UI-only: the player opened the build menu on a node. */
  | { type: 'select'; node?: string }
  /** UI-only: the player pressed the spell button. */
  | { type: 'spellSelect' }
  | { type: 'cast'; spell?: SpellId }
  | { type: 'special'; event: SpecialEvent }
  | { type: 'any'; of: StepCondition[] };

export interface TutorialStep {
  /** i18n key of the hint; a step without one shows nothing and just waits (e.g. for an army to arrive). */
  hint?: string;
  highlight?: TutorialAnchor[];
  finger?: FingerHint;
  until: StepCondition;
  /** The battle runs at SLOW_MO.speed while this step waits for the player. Not for `time` steps. */
  slow?: boolean;
}

export interface TutorialScript {
  /** Run only if the player takes this spell into battle (the spell lesson, TUTORIAL.md T-5). */
  requires?: { activeSpell: SpellId };
  steps: TutorialStep[];
}

export interface TutorialState {
  script: TutorialScript;
  index: number;
  stepStartTick: number;
}

export type UiEvent = { type: 'select'; node: string } | { type: 'spellSelect'; spell: SpellId };

export function startTutorial(script: TutorialScript, tick: number): TutorialState {
  return { script, index: 0, stepStartTick: tick };
}

/**
 * The tutorial runs only on the first playthrough of a level (replays have no hints and no slow-down),
 * and only if what it teaches is there (`requires`).
 */
export function shouldRunTutorial(level: LevelData, progress: Progress, script: TutorialScript | undefined): boolean {
  if (!script || level.tutorial === undefined || progress.completed.includes(level.id)) return false;
  return !script.requires || activeSpell(progress) === script.requires.activeSpell;
}

export function currentStep(state: TutorialState): TutorialStep | null {
  return state.script.steps[state.index] ?? null;
}

/** Whether the tutorial slows the battle down now: a `slow` step is waiting for the player. */
export function isTutorialSlow(state: TutorialState | null): boolean {
  return state !== null && currentStep(state)?.slow === true;
}

/** Checks the current step against this tick's events; moves to the next step if done. Returns true on change. */
export function advanceTutorial(
  state: TutorialState,
  world: World,
  events: readonly TickEvent[],
  ui: readonly UiEvent[] = [],
): boolean {
  const step = currentStep(state);
  if (!step || !isDone(step.until, state, world, events, ui)) return false;
  state.index += 1;
  state.stepStartTick = world.tick;
  return true;
}

function isDone(
  until: StepCondition,
  state: TutorialState,
  world: World,
  events: readonly TickEvent[],
  ui: readonly UiEvent[],
): boolean {
  switch (until.type) {
    case 'send': {
      // A multi-node swipe is one send per source in the same tick, all to the same target.
      const targets = new Map<string, number>();
      for (const e of events) {
        if (e.type !== 'applied' || e.command.type !== 'send' || e.command.side !== 'player') continue;
        if (until.to && e.command.to !== until.to) continue;
        targets.set(e.command.to, (targets.get(e.command.to) ?? 0) + 1);
      }
      return [...targets.values()].some((n) => n >= (until.minSources ?? 1));
    }
    case 'capture':
      return events.some(
        (e) =>
          e.type === 'arrived' &&
          e.outcome === 'captured' &&
          world.nodes[e.nodeId]?.owner === 'player' &&
          (!until.node || e.nodeId === until.node),
      );
    case 'build':
      return events.some(
        (e) =>
          e.type === 'applied' &&
          e.command.type === 'build' &&
          e.command.side === 'player' &&
          (!until.building || e.command.building === until.building) &&
          (!until.node || e.command.nodeId === until.node),
      );
    case 'gold':
      return world.sides.player.gold >= until.atLeast;
    case 'time':
      return (world.tick - state.stepStartTick) * TICK_MS >= until.sec * 1000;
    case 'select':
      return ui.some((e) => e.type === 'select' && (!until.node || e.node === until.node));
    case 'spellSelect':
      return ui.some((e) => e.type === 'spellSelect');
    case 'cast':
      return events.some(
        (e) =>
          e.type === 'applied' && e.command.type === 'cast' && e.command.side === 'player' && (!until.spell || e.command.spell === until.spell),
      );
    case 'special':
      return events.some((e) => e.type === until.event);
    case 'any':
      return until.of.some((c) => isDone(c, state, world, events, ui));
  }
}

/**
 * Checks a script against its level: known nodes and texts, no `slow` on `time` steps (nothing to wait for),
 * info-only `time` steps at most TUTORIAL.infoStepMaxSec.
 */
export function validateTutorial(script: TutorialScript, level: LevelData, hasKey: (key: string) => boolean): string[] {
  const errors: string[] = [];
  const ids = new Set(level.nodes.map((n) => n.id));
  const node = (id: string | undefined, where: string): void => {
    if (id !== undefined && !ids.has(id)) errors.push(`${level.id} ${where}: unknown node ${id}`);
  };
  const condition = (u: StepCondition, where: string): void => {
    if (u.type === 'send') node(u.to, where);
    if (u.type === 'capture' || u.type === 'build' || u.type === 'select') node(u.node, where);
    if (u.type === 'any') {
      if (u.of.length === 0) errors.push(`${level.id} ${where}: 'any' needs conditions`);
      u.of.forEach((c) => condition(c, where));
    }
  };
  if (script.steps.length === 0) errors.push(`${level.id}: tutorial has no steps`);
  script.steps.forEach((step, i) => {
    const where = `step ${i + 1}`;
    if (step.hint !== undefined && !hasKey(step.hint)) errors.push(`${level.id} ${where}: missing text ${step.hint}`);
    for (const h of step.highlight ?? []) if ('node' in h) node(h.node, where);
    const f = step.finger;
    if (f?.kind === 'tap') node(f.node, where);
    if (f?.kind === 'drag') {
      const path = dragPath(f);
      if (path.length < 2) errors.push(`${level.id} ${where}: drag needs a source and a target`);
      path.forEach((id) => node(id, where));
    }
    condition(step.until, where);
    if (step.until.type === 'time') {
      if (step.slow) errors.push(`${level.id} ${where}: a time step cannot be slow`);
      if (step.until.sec > TUTORIAL.infoStepMaxSec) errors.push(`${level.id} ${where}: info step longer than ${TUTORIAL.infoStepMaxSec} s`);
    }
  });
  return errors;
}

/** Node ids a drag finger goes through: sources first, the target last. */
export function dragPath(f: Extract<FingerHint, { kind: 'drag' }>): string[] {
  return 'path' in f ? f.path : [f.from, f.to];
}
