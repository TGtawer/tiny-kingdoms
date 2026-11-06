import { describe, expect, it } from 'vitest';
import { SLOW_MO, TICK_MS, type BuildingType } from '../../../src/config/balance';
import { aiParamsFromLevel, aiStep, createAi } from '../../../src/core/ai/EnemyAI';
import type { LevelData } from '../../../src/core/level/schema';
import { defaultProgress } from '../../../src/core/meta/Progress';
import { unlockSpell } from '../../../src/core/meta/spellbook';
import { playerSetupFrom } from '../../../src/core/meta/upgrades';
import { validate, type Command } from '../../../src/core/sim/commands';
import { step } from '../../../src/core/sim/tick';
import { createWorld, type World } from '../../../src/core/sim/World';
import {
  enemyMayAct,
  gateLocked,
  isActionStep,
  isCommandAllowed,
  isSendAllowed,
  isUiAllowed,
  lessonActive,
  stepProblem,
  type GateUi,
} from '../../../src/core/tutorial/gate';
import {
  advanceTutorial,
  currentStep,
  dragPath,
  introCardFor,
  resolveFrom,
  shouldRunTutorial,
  startTutorial,
  type StepCondition,
  type TutorialState,
  type TutorialStep,
  type UiEvent,
  validateTutorial,
} from '../../../src/core/tutorial/tutorial';
import { ALL_LEVELS, DEV_LEVELS, TUTORIALS } from '../../../src/levels';

/**
 * The lesson gate (PLAYTEST-1 F-6) on every level with a tutorial, first playthrough. A "harmful bot" offers every
 * player command and every UI event on every tick: only what the current step asks for may pass. The allowed action
 * is done 0, 5 or 60 s of real time after its step starts (slowed down meanwhile). At the start of every action step
 * the action must be doable, the lesson must end, the enemy must not act during it, and nothing is locked after it.
 */

const BUILDINGS: readonly BuildingType[] = ['barracks', 'tower', 'mine'];

/** Every command the player could try right now (before validation). */
function allCommands(world: World): Command[] {
  const ids = Object.keys(world.nodes);
  const own = ids.filter((id) => world.nodes[id]!.owner === 'player');
  const out: Command[] = [];
  for (const from of own) for (const to of ids) if (from !== to) out.push({ type: 'send', side: 'player', from, to });
  for (const nodeId of own) {
    for (const building of BUILDINGS) out.push({ type: 'build', side: 'player', nodeId, building });
    out.push({ type: 'upgrade', side: 'player', nodeId });
  }
  for (const spell of world.sides.player.unlockedSpells) for (const nodeId of ids) out.push({ type: 'cast', side: 'player', spell, nodeId });
  return out;
}

function allUi(world: World): GateUi[] {
  return [...Object.keys(world.nodes).map((node) => ({ type: 'select', node }) as const), { type: 'deselect' }, { type: 'spellSelect' }];
}

const parts = (u: StepCondition): StepCondition[] => (u.type === 'any' ? u.of.flatMap(parts) : [u]);

/** Independent reading of what a step asks for: does this single command belong to its action? */
function fitsStep(s: TutorialStep, world: World, cmd: Command): boolean {
  const pointed = [...(s.highlight ?? []).flatMap((h) => ('node' in h ? [h.node] : [])), ...(s.finger?.kind === 'tap' ? [s.finger.node] : [])];
  return parts(s.until).some((u) => {
    if (cmd.type === 'send' && u.type === 'send') {
      if (u.to && cmd.to !== u.to) return false;
      if (u.from && cmd.from !== resolveFrom(u.from, world)) return false;
      if (s.finger?.kind === 'drag') {
        const path = dragPath(s.finger);
        return cmd.to === path[path.length - 1] && path.slice(0, -1).includes(cmd.from) && (u.minSources ?? 1) <= 1;
      }
      return true;
    }
    if (cmd.type === 'build' && u.type === 'build') {
      const node = u.node ?? (s.finger?.kind === 'tap' ? s.finger.node : undefined);
      return (!u.building || cmd.building === u.building) && (!node || cmd.nodeId === node);
    }
    if (cmd.type === 'cast' && u.type === 'cast') return (!u.spell || cmd.spell === u.spell) && (pointed.length === 0 || pointed.includes(cmd.nodeId));
    return false;
  });
}

/** The action of the step as the bot does it: commands for the queue and UI events for the tutorial. */
function doAction(s: TutorialStep, state: TutorialState, world: World): { commands: Command[]; ui: UiEvent[] } {
  // A finger swipe through several nodes: one gesture, all of them at once.
  if (s.finger?.kind === 'drag') {
    const path = dragPath(s.finger);
    const to = path[path.length - 1]!;
    const sources = path.slice(0, -1);
    if (isSendAllowed(state, world, sources, to)) {
      return { commands: sources.map((from) => ({ type: 'send', side: 'player', from, to }) as const), ui: [] };
    }
  }
  for (const ui of allUi(world)) {
    if (ui.type === 'select' && isUiAllowed(state, ui) && parts(s.until).some((u) => u.type === 'select')) return { commands: [], ui: [ui] };
    if (ui.type === 'spellSelect' && isUiAllowed(state, ui) && parts(s.until).some((u) => u.type === 'spellSelect')) {
      return { commands: [], ui: [{ type: 'spellSelect', spell: world.sides.player.unlockedSpells[0]! }] };
    }
  }
  const cmd = allCommands(world).find((c) => isCommandAllowed(state, world, c) && validate(world, c) === null);
  return { commands: cmd ? [cmd] : [], ui: [] };
}

interface Run {
  actionSteps: number;
  lessonTicks: number;
  problems: string[];
  leaks: string[];
  enemyCommands: number;
}

/** First playthrough of `level` with the bot acting `delaySec` of real time after each action step starts. */
function runLesson(level: LevelData, delaySec: number): Run {
  const script = TUTORIALS[level.tutorial!]!;
  const progress = defaultProgress();
  if (script.requires) unlockSpell(progress, script.requires.activeSpell);
  expect(shouldRunTutorial(level, progress, script)).toBe(true);
  const world = createWorld(level, { seed: 1, player: playerSetupFrom(progress) });
  const state = startTutorial(script, world.tick);
  const params = aiParamsFromLevel(level.enemy, world.goal, world.capitals.player);
  const ai = createAi('enemy', lessonActive(state) ? { ...params, startDelayMs: 0 } : params);
  const delayTicks = Math.round((delaySec * 1000 * SLOW_MO.speed) / TICK_MS);
  const run: Run = { actionSteps: 0, lessonTicks: 0, problems: [], leaks: [], enemyCommands: 0 };

  let checkedIndex = -1;
  let ui: UiEvent[] = [];
  for (let t = 0; t < 6000 && !world.winner && currentStep(state); t++) {
    const s = currentStep(state)!;
    const locked = gateLocked(state);
    if (isActionStep(s) && checkedIndex !== state.index) {
      checkedIndex = state.index;
      run.actionSteps++;
      const problem = stepProblem(state, world);
      if (problem) run.problems.push(`step ${state.index + 1}: ${problem}`);
    }

    // The harmful bot: everything it tries, only the step's action may pass.
    for (const cmd of allCommands(world)) {
      const allowed = isCommandAllowed(state, world, cmd);
      if (!locked && !allowed) run.leaks.push(`tick ${t}: free but refused ${JSON.stringify(cmd)}`);
      if (locked && allowed && !(isActionStep(s) && fitsStep(s, world, cmd))) run.leaks.push(`step ${state.index + 1}: let through ${JSON.stringify(cmd)}`);
    }
    for (const event of allUi(world)) {
      if (locked && isUiAllowed(state, event) && !isActionStep(s)) run.leaks.push(`step ${state.index + 1}: let through ${JSON.stringify(event)}`);
    }

    let commands: Command[] = [];
    if (isActionStep(s) && world.tick - state.stepStartTick >= delayTicks) {
      const action = doAction(s, state, world);
      commands = action.commands;
      ui = action.ui;
    }
    if (enemyMayAct(state)) {
      commands = [...commands, ...aiStep(world, ai)];
    } else {
      run.lessonTicks++;
      if (world.streams.some((st) => st.owner === 'enemy') || world.units.some((u) => u.owner === 'enemy')) run.enemyCommands++;
    }
    const events = step(world, commands);
    advanceTutorial(state, world, events, ui);
    ui = [];
    // After the lesson nothing is locked (a `step` gate locks only its action steps).
    if (!lessonActive(state) && !isActionStep(currentStep(state)) && gateLocked(state)) run.leaks.push(`tick ${t}: locked after the lesson`);
  }
  expect(currentStep(state), `${level.id} (${delaySec} s): the tutorial did not finish`).toBeNull();
  return run;
}

const LESSONS = [...ALL_LEVELS, ...DEV_LEVELS].filter((l) => l.tutorial && TUTORIALS[l.tutorial]);

describe('lesson gate on every tutorial (PLAYTEST-1 F-6)', () => {
  it.each(LESSONS.flatMap((l) => [0, 5, 60].map((d) => [l.id, d, l] as const)))('%s, action after %i s', (_id, delay, level) => {
    const run = runLesson(level, delay);
    expect(run.problems, 'an action step could not be done at its start').toEqual([]);
    expect(run.leaks.slice(0, 5)).toEqual([]);
    expect(run.enemyCommands, 'the enemy acted during the lesson').toBe(0);
    expect(run.lessonTicks).toBeLessThan(3000);
  });

  it('chapter 1 lessons 1, 3, 5, 7 have action steps and lock the battle from the start', () => {
    for (const id of ['c01_l01', 'c01_l03', 'c01_l05', 'c01_l07']) {
      const state = startTutorial(TUTORIALS[id]!, 0);
      expect(lessonActive(state), id).toBe(true);
      expect(enemyMayAct(state), id).toBe(false);
    }
  });

  it('a step gate (level 10) locks only its action step; the enemy acts all along', () => {
    const state = startTutorial(TUTORIALS.c01_l10!, 0);
    expect(lessonActive(state)).toBe(false);
    expect(enemyMayAct(state)).toBe(true);
    expect(gateLocked(state)).toBe(false);
  });
});

describe('lesson gate rules', () => {
  const lesson = (id: string, index: number): TutorialState => ({ ...startTutorial(TUTORIALS[id]!, 0), index });
  const world = (id: string): World => createWorld(ALL_LEVELS.find((l) => l.id === id)!, { seed: 1 });

  it('level 5: before the pass is taken nothing but the swipe to it works; the tower only on the pass', () => {
    const w = world('c01_l05');
    const swipe = lesson('c01_l05', 0);
    expect(isSendAllowed(swipe, w, ['player'], 'neck')).toBe(true);
    expect(isCommandAllowed(swipe, w, { type: 'build', side: 'player', nodeId: 'player', building: 'barracks' })).toBe(false);
    const tower = lesson('c01_l05', 2);
    expect(isCommandAllowed(tower, w, { type: 'build', side: 'player', nodeId: 'neck', building: 'tower' })).toBe(true);
    expect(isCommandAllowed(tower, w, { type: 'build', side: 'player', nodeId: 'neck', building: 'barracks' })).toBe(false);
    expect(isCommandAllowed(tower, w, { type: 'build', side: 'player', nodeId: 'player', building: 'tower' })).toBe(false);
    expect(isUiAllowed(tower, { type: 'select', node: 'neck' })).toBe(true);
    expect(isUiAllowed(tower, { type: 'select', node: 'player' })).toBe(false);
    expect(isUiAllowed(tower, { type: 'deselect' })).toBe(false);
  });

  it('level 3: the castle menu does not close before the barracks; no upgrade, no swipe', () => {
    const w = world('c01_l03');
    const build = lesson('c01_l03', 2);
    expect(isUiAllowed(build, { type: 'deselect' })).toBe(false);
    expect(isCommandAllowed(build, w, { type: 'build', side: 'player', nodeId: 'player', building: 'barracks' })).toBe(true);
    expect(isCommandAllowed(build, w, { type: 'upgrade', side: 'player', nodeId: 'player' })).toBe(false);
    expect(isSendAllowed(build, w, ['player'], Object.keys(w.nodes).find((id) => id !== 'player')!)).toBe(false);
    // The info step after it is past the lesson: everything is free again.
    const after = lesson('c01_l03', 3);
    expect(gateLocked(after)).toBe(false);
    expect(isUiAllowed(after, { type: 'deselect' })).toBe(true);
  });

  it('level 1: the swipe through both nodes must start from both of them', () => {
    const w = world('c01_l01');
    const many = lesson('c01_l01', 3);
    expect(isSendAllowed(many, w, ['player', 'n1'], 'n2')).toBe(true);
    expect(isSendAllowed(many, w, ['player'], 'n2')).toBe(false);
    expect(isSendAllowed(many, w, ['n1'], 'n2')).toBe(false);
    // The first swipe only from the finger's source, only to its target, even with other own nodes around.
    const first = lesson('c01_l01', 0);
    w.nodes.n2!.owner = 'player';
    expect(isSendAllowed(first, w, ['player'], 'n1')).toBe(true);
    expect(isSendAllowed(first, w, ['n2'], 'n1')).toBe(false);
    expect(isSendAllowed(first, w, ['player'], 'n2')).toBe(false);
    // Waiting for the capture inside the lesson: everything is locked.
    const wait = lesson('c01_l01', 1);
    expect(isSendAllowed(wait, w, ['player'], 'n1')).toBe(false);
    expect(isUiAllowed(wait, { type: 'select', node: 'player' })).toBe(false);
  });

  it('level 7: the spell only on the shown node; spending gold on anything else is refused', () => {
    const w = world('c01_l07');
    const cast = lesson('c01_l07', 1);
    expect(isCommandAllowed(cast, w, { type: 'cast', side: 'player', spell: 'reinforcement', nodeId: 'player' })).toBe(true);
    const other = Object.keys(w.nodes).find((id) => id !== 'player' && w.nodes[id]!.owner === 'player') ?? 'enemy';
    expect(isCommandAllowed(cast, w, { type: 'cast', side: 'player', spell: 'reinforcement', nodeId: other })).toBe(false);
    expect(isCommandAllowed(cast, w, { type: 'upgrade', side: 'player', nodeId: 'player' })).toBe(false);
    expect(isCommandAllowed(lesson('c01_l07', 0), w, { type: 'build', side: 'player', nodeId: 'player', building: 'barracks' })).toBe(false);
  });

  it('without a tutorial nothing is locked', () => {
    const w = world('c01_l02');
    expect(gateLocked(null)).toBe(false);
    expect(enemyMayAct(null)).toBe(true);
    expect(isCommandAllowed(null, w, { type: 'upgrade', side: 'player', nodeId: 'player' })).toBe(true);
  });
});

describe('validateTutorial: action steps name what the gate lets through', () => {
  it('an action send without a finger, to or from is an error; one that also ends on a boss event is not', () => {
    const level = ALL_LEVELS[0]!;
    const ok = (): boolean => true;
    expect(validateTutorial({ steps: [{ hint: 'tut.goal', until: { type: 'send' }, slow: true }] }, level, ok)).toEqual([
      `${level.id} step 1: an action send needs a drag finger, 'to' or 'from'`,
    ]);
    const boss = { steps: [{ hint: 'tut.goal', until: { type: 'any', of: [{ type: 'send' }, { type: 'special', event: 'mageStrike' }] }, slow: true }] } as const;
    expect(validateTutorial(boss as never, level, ok)).toEqual([]);
  });
});

describe('level 10: the evil mage (PLAYTEST-1 F-8)', () => {
  const level = ALL_LEVELS.find((l) => l.id === 'c01_l10')!;
  const script = TUTORIALS.c01_l10!;

  it('the mage card comes before the first playthrough only', () => {
    const fresh = defaultProgress();
    expect(introCardFor(level, fresh, script)).toBe('mage');
    fresh.completed.push(level.id);
    expect(introCardFor(level, fresh, script)).toBeNull();
    expect(introCardFor(ALL_LEVELS.find((l) => l.id === 'c01_l09')!, defaultProgress(), TUTORIALS.c01_l09)).toBeNull();
  });

  it('no timed mage hint any more: the script waits for the warning, then asks to move out of the marked node', () => {
    expect(script.gate).toBe('step');
    expect(script.steps.map((s) => s.until.type)).toEqual(['special', 'any']);
  });

  it('on the warning only a send out of the marked node works, to any target', () => {
    const world = createWorld(level, { seed: 1 });
    const own = Object.keys(world.nodes).filter((id) => world.nodes[id]!.owner === 'player');
    const marked = own[0]!;
    world.boss = { ...(world.boss as Extract<World['boss'], { type: 'mage' }>), targetId: marked };
    const state: TutorialState = { ...startTutorial(script, 0), index: 1 };
    expect(gateLocked(state)).toBe(true);
    const others = Object.keys(world.nodes).filter((id) => id !== marked);
    for (const to of others) expect(isSendAllowed(state, world, [marked], to), to).toBe(true);
    for (const from of own.slice(1)) expect(isSendAllowed(state, world, [from], marked)).toBe(false);
    expect(isUiAllowed(state, { type: 'select', node: marked })).toBe(false);
    // Before the warning the player is free.
    expect(gateLocked({ ...state, index: 0 })).toBe(false);
  });
});
