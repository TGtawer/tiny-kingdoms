import { buildCost, sendAmount, validate, type Command } from '../sim/commands';
import { armyPath } from '../sim/pathfinding';
import { spellCost } from '../sim/spells';
import { isAttacked, type World } from '../sim/World';
import { currentStep, dragPath, resolveFrom, type StepCondition, type TutorialState, type TutorialStep } from './tutorial';

/**
 * The lesson gate (PLAYTEST-1 F-6, GDD 6): first the tutorial, then freedom. While a lesson runs only the action of
 * the current hint works, with the nodes of its finger and highlight; on wait and info steps inside the lesson
 * nothing does. Pause, exit, restart, sound and music are never gated (the scene doesn't ask). Nothing here adds
 * troops or gold: a script must always be doable, which `stepProblem` checks and the lesson test proves.
 * Pure functions over the tutorial state and the world.
 */

/** Player input outside the command queue that the gate rules on. */
export type GateUi =
  /** Open the build menu of an own node. */
  | { type: 'select'; node: string }
  /** Close the build menu (a tap elsewhere or on the same node again). */
  | { type: 'deselect' }
  /** Press the spell button (arm or disarm). */
  | { type: 'spellSelect' };

/** An action step: it waits for the player and slows the battle down (`slow`). */
export function isActionStep(step: TutorialStep | null): boolean {
  return step?.slow === true;
}

/** Index of the last action step of the script (-1 if it has none). */
function lastActionIndex(state: TutorialState): number {
  const steps = state.script.steps;
  for (let i = steps.length - 1; i >= 0; i--) if (isActionStep(steps[i]!)) return i;
  return -1;
}

/**
 * A `lesson` gate is on from the battle start until the last action step is done; info steps after it lock nothing.
 * A `step` gate never makes a lesson (only its action steps lock).
 */
export function lessonActive(state: TutorialState | null): boolean {
  if (!state || (state.script.gate ?? 'lesson') !== 'lesson') return false;
  return state.index <= lastActionIndex(state);
}

/** Whether player input is locked down to the current step's action right now. */
export function gateLocked(state: TutorialState | null): boolean {
  return lessonActive(state) || (state !== null && isActionStep(currentStep(state)));
}

/** The enemy AI makes no decisions during a lesson; it starts right after it (a `step` gate never stops it). */
export function enemyMayAct(state: TutorialState | null): boolean {
  return !lessonActive(state);
}

/** The step's condition split into its parts (`any` → each of them). */
function parts(until: StepCondition): StepCondition[] {
  return until.type === 'any' ? until.of.flatMap(parts) : [until];
}

/** Nodes the step points at: its highlights and its finger. */
function pointedNodes(step: TutorialStep, world: World): string[] {
  const out: string[] = [];
  for (const h of step.highlight ?? []) {
    if ('node' in h) out.push(h.node);
    if ('bossTarget' in h) {
      const target = resolveFrom('bossTarget', world);
      if (target) out.push(target);
    }
  }
  const f = step.finger;
  if (f?.kind === 'tap') out.push(f.node);
  if (f?.kind === 'drag') out.push(...dragPath(f));
  return out;
}

/** The node a build (or its menu) is for: the condition's node, else the finger's tap, else any own node (null). */
function buildNode(step: TutorialStep, until: Extract<StepCondition, { type: 'build' }>): string | null {
  if (until.node) return until.node;
  return step.finger?.kind === 'tap' ? step.finger.node : null;
}

/**
 * Whether one swipe — `sources` to `to`, all in one gesture — is what the current step asks for:
 * the finger's sources and target (all of the finger's sources for `minSources`), and the condition's `to`/`from`.
 */
export function isSendAllowed(state: TutorialState | null, world: World, sources: readonly string[], to: string): boolean {
  if (!gateLocked(state)) return true;
  const step = currentStep(state!);
  if (!step || !isActionStep(step)) return false;
  return parts(step.until).some((u) => {
    if (u.type !== 'send') return false;
    if (u.to && to !== u.to) return false;
    if (u.from) {
      const from = resolveFrom(u.from, world);
      if (from === null || sources.some((s) => s !== from)) return false;
    }
    const f = step.finger;
    if (f?.kind === 'drag') {
      const path = dragPath(f);
      const target = path[path.length - 1]!;
      const fingerSources = path.slice(0, -1);
      if (to !== target || sources.some((s) => !fingerSources.includes(s))) return false;
      if ((u.minSources ?? 1) > 1 && fingerSources.some((s) => !sources.includes(s))) return false;
    }
    return sources.length >= (u.minSources ?? 1);
  });
}

/** Whether a player command passes the gate (sends one by one: a multi-node swipe goes through isSendAllowed). */
export function isCommandAllowed(state: TutorialState | null, world: World, cmd: Command): boolean {
  if (!gateLocked(state)) return true;
  if (cmd.type === 'send') return isSendAllowed(state, world, [cmd.from], cmd.to);
  const step = currentStep(state!);
  if (!step || !isActionStep(step)) return false;
  return parts(step.until).some((u) => {
    if (cmd.type === 'build' && u.type === 'build') {
      const node = buildNode(step, u);
      return (!u.building || cmd.building === u.building) && (node === null || cmd.nodeId === node);
    }
    if (cmd.type === 'cast' && u.type === 'cast') {
      const nodes = pointedNodes(step, world);
      return (!u.spell || cmd.spell === u.spell) && (nodes.length === 0 || nodes.includes(cmd.nodeId));
    }
    // Upgrades are never part of a lesson.
    return false;
  });
}

/** Whether a tap or button press passes the gate. */
export function isUiAllowed(state: TutorialState | null, ui: GateUi): boolean {
  if (!gateLocked(state)) return true;
  const step = currentStep(state!);
  if (!step || !isActionStep(step)) return false;
  return parts(step.until).some((u) => {
    if (ui.type === 'select') {
      if (u.type === 'select') return !u.node || ui.node === u.node;
      // A build step opens the menu of its node (the tower lesson taps the pass, then builds).
      if (u.type === 'build') {
        const node = buildNode(step, u);
        return node === null || ui.node === node;
      }
      return false;
    }
    // The menu of a build step stays open until the building is placed.
    if (ui.type === 'deselect') return false;
    // The spell button arms the spell; on a cast step it may be pressed again to re-arm.
    return u.type === 'spellSelect' || u.type === 'cast';
  });
}

/**
 * Why the current action step can't be done right now (null: it can). Checked at the start of every action step
 * by the lesson test: enough gold for the building or spell, a source with more than one unit that is not attacked,
 * a path to the target. A step that also ends on a boss event is exempt (it ends by itself).
 */
export function stepProblem(state: TutorialState, world: World): string | null {
  const step = currentStep(state);
  if (!step || !isActionStep(step)) return null;
  const ps = parts(step.until);
  if (ps.some((u) => u.type === 'special')) return null;
  const gold = world.sides.player.gold;
  const problems: string[] = [];
  for (const u of ps) {
    if (u.type === 'send') {
      const f = step.finger;
      const path = f?.kind === 'drag' ? dragPath(f) : null;
      const from = u.from ? resolveFrom(u.from, world) : null;
      const sources = path ? path.slice(0, -1) : from ? [from] : Object.values(world.nodes).filter((n) => n.owner === 'player').map((n) => n.id);
      const to = path ? path[path.length - 1]! : u.to;
      const ready = sources.filter((id) => {
        const n = world.nodes[id];
        return n && n.owner === 'player' && sendAmount(n.troops) > 0 && !isAttacked(world, n) && (!to || armyPath(world, 'player', id, to));
      });
      const need = path && (u.minSources ?? 1) > 1 ? sources.length : (u.minSources ?? 1);
      if (ready.length >= need) return null;
      problems.push(`send: ${ready.length} of ${need} sources ready (${sources.join(', ')} → ${to ?? 'any'})`);
    } else if (u.type === 'build') {
      const node = buildNode(step, u);
      const ok = node === null || validate(world, { type: 'build', side: 'player', nodeId: node, building: u.building ?? 'barracks' }) === null;
      if (gold >= buildCost(0)! && ok) return null;
      problems.push(`build: gold ${gold} of ${buildCost(0)}, node ${node ?? 'any'}`);
    } else if (u.type === 'cast' || u.type === 'spellSelect') {
      const spell = u.type === 'cast' ? u.spell : undefined;
      const spells = spell ? [spell] : world.sides.player.unlockedSpells;
      if (spells.some((s) => world.sides.player.unlockedSpells.includes(s) && gold >= spellCost(s) && world.sides.player.spellCooldowns[s] <= 0)) {
        return null;
      }
      problems.push(`${u.type}: no spell ready (gold ${gold})`);
    } else if (u.type === 'select') {
      if (!u.node || world.nodes[u.node]?.owner === 'player') return null;
      problems.push(`select: ${u.node} is not the player's`);
    } else {
      return null;
    }
  }
  return problems.join('; ') || null;
}
