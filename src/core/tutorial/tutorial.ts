import { TICK_MS, type BuildingType } from '../../config/balance';
import type { LevelData } from '../level/schema';
import type { TickEvent } from '../sim/tick';
import type { World } from '../sim/World';

/**
 * Step-by-step tutorial: one short hint at a time, highlights and a finger showing the gesture.
 * A step ends when the player does what it asks (or after some time for info-only steps).
 */

export type TutorialAnchor = { node: string } | { ui: 'gold' };

export type FingerHint =
  | { kind: 'drag'; from: string; to: string }
  | { kind: 'tap'; node: string }
  | { kind: 'tapTap'; from: string; to: string };

export type StepCondition =
  | { type: 'send'; to?: string }
  | { type: 'capture'; node?: string }
  | { type: 'build'; building?: BuildingType; node?: string }
  | { type: 'gold'; atLeast: number }
  | { type: 'time'; sec: number }
  /** UI-only: the player opened the build menu on a node. */
  | { type: 'select'; node?: string };

export interface TutorialStep {
  /** i18n key of the hint. */
  hint: string;
  highlight?: TutorialAnchor[];
  finger?: FingerHint;
  until: StepCondition;
}

export interface TutorialScript {
  steps: TutorialStep[];
}

export interface TutorialState {
  script: TutorialScript;
  index: number;
  stepStartTick: number;
}

export type UiEvent = { type: 'select'; node: string };

export function startTutorial(script: TutorialScript, tick: number): TutorialState {
  return { script, index: 0, stepStartTick: tick };
}

export function currentStep(state: TutorialState): TutorialStep | null {
  return state.script.steps[state.index] ?? null;
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
    case 'send':
      return events.some(
        (e) =>
          e.type === 'applied' &&
          e.command.type === 'send' &&
          e.command.side === 'player' &&
          (!until.to || e.command.to === until.to),
      );
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
  }
}

/** Checks that every node a script refers to exists in the level and every hint key is known. */
export function validateTutorial(script: TutorialScript, level: LevelData, hasKey: (key: string) => boolean): string[] {
  const errors: string[] = [];
  const ids = new Set(level.nodes.map((n) => n.id));
  const node = (id: string | undefined, where: string): void => {
    if (id !== undefined && !ids.has(id)) errors.push(`${level.id} ${where}: unknown node ${id}`);
  };
  if (script.steps.length === 0) errors.push(`${level.id}: tutorial has no steps`);
  script.steps.forEach((step, i) => {
    const where = `step ${i + 1}`;
    if (!hasKey(step.hint)) errors.push(`${level.id} ${where}: missing text ${step.hint}`);
    for (const h of step.highlight ?? []) if ('node' in h) node(h.node, where);
    const f = step.finger;
    if (f?.kind === 'tap') node(f.node, where);
    if (f && f.kind !== 'tap') {
      node(f.from, where);
      node(f.to, where);
    }
    const u = step.until;
    if (u.type === 'send') node(u.to, where);
    if (u.type === 'capture' || u.type === 'build' || u.type === 'select') node(u.node, where);
  });
  return errors;
}
