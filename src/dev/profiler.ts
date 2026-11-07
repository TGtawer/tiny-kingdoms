import * as Phaser from 'phaser';
import { BattleScene } from '../scenes/BattleScene';
import { NodeView } from '../view/NodeView';
import { UnitsView } from '../view/UnitsView';

/**
 * Dev-only battle profiler (docs/PERF.md PF-0), on with `?profile` (main.ts loads it only on the dev server).
 * It changes nothing in the game: it wraps a few methods to count and time them, and `scripts/profile-battle.mjs`
 * reads the numbers through `window.__profile`.
 * - frame interval (rAF to rAF) and frame work (Phaser pre-step to post-render), ms;
 * - draw calls per frame (WebGLRenderer.drawElements);
 * - time per frame in BattleScene.update (all of it), its simulation ticks (and how many), BattleScene.render,
 *   NodeView.sync (all nodes) and UnitsView.render;
 * - the whole Phaser render pass (SceneManager.render) and the part spent drawing Graphics objects, with how many
 *   Graphics were drawn and their command count (Phaser 4 rebuilds every Graphics' geometry each frame);
 * - Text.setText calls, Text redraws (canvas + GPU upload), Graphics.clear calls;
 * - `?stopAt=N`: the battle stops at tick N (fixed moment for reference screenshots).
 * Buffers are preallocated so the profiler itself adds no garbage while measuring.
 */

const MAX_FRAMES = 20_000;

interface Counters {
  setText: number;
  textRedraws: number;
  graphicsClear: number;
}

export interface ProfileReport {
  frames: number;
  seconds: number;
  interval: { avg: number; p95: number; p99: number; max: number };
  work: { avg: number; p95: number; p99: number; max: number };
  drawCalls: { avg: number; max: number };
  /** Average ms per frame. */
  updateMs: number;
  tickMs: number;
  ticksPerFrame: number;
  renderMs: number;
  /** Phaser's render pass (all scenes) and its Graphics part; Graphics drawn per frame and their commands. */
  phaserRenderMs: number;
  graphicsMs: number;
  graphicsDrawn: number;
  graphicsCommands: number;
  syncMs: number;
  unitsMs: number;
  /** Per second. */
  setText: number;
  textRedraws: number;
  graphicsClear: number;
  units: number;
  tick: number;
  /** Interval of the first battle frames, ms (PF-6). */
  firstFrames: number[];
}

type Method = (this: unknown, ...args: unknown[]) => unknown;

/** Wraps `obj[name]`; `around` gets the original call and its arguments. */
function wrap(obj: object, name: string, around: (call: () => unknown, self: unknown, args: unknown[]) => unknown): void {
  const target = obj as Record<string, Method>;
  const original = target[name];
  if (typeof original !== 'function') throw new Error(`profiler: no method ${name}`);
  target[name] = function (this: unknown, ...args: unknown[]): unknown {
    return around(() => original.apply(this, args), this, args);
  };
}

function stats(values: Float64Array, n: number): { avg: number; p95: number; p99: number; max: number } {
  if (n === 0) return { avg: 0, p95: 0, p99: 0, max: 0 };
  const sorted = Array.from(values.subarray(0, n)).sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(n - 1, Math.floor(q * n))]!;
  const round = (v: number): number => Math.round(v * 100) / 100;
  return { avg: round(sorted.reduce((s, v) => s + v, 0) / n), p95: round(at(0.95)), p99: round(at(0.99)), max: round(sorted[n - 1]!) };
}

export function installProfiler(game: Phaser.Game, search: string): void {
  const params = new URLSearchParams(search);
  const stopAt = params.has('stopAt') ? Number(params.get('stopAt')) : null;

  const interval = new Float64Array(MAX_FRAMES);
  const work = new Float64Array(MAX_FRAMES);
  const draws = new Float64Array(MAX_FRAMES);
  const updateMs = new Float64Array(MAX_FRAMES);
  const tickMs = new Float64Array(MAX_FRAMES);
  const ticks = new Float64Array(MAX_FRAMES);
  const renderMs = new Float64Array(MAX_FRAMES);
  const phaserMs = new Float64Array(MAX_FRAMES);
  const gfxMs = new Float64Array(MAX_FRAMES);
  const gfxDrawn = new Float64Array(MAX_FRAMES);
  const gfxCommands = new Float64Array(MAX_FRAMES);
  const syncMs = new Float64Array(MAX_FRAMES);
  const unitsMs = new Float64Array(MAX_FRAMES);
  const firstFrames: number[] = [];
  const counters: Counters = { setText: 0, textRedraws: 0, graphicsClear: 0 };
  let recording = false;
  let frame = 0;
  let startedAt = 0;
  let stepAt = 0;
  let lastFrameAt = 0;
  let frameDraws = 0;
  let frameUpdate = 0;
  let frameTick = 0;
  let frameTicks = 0;
  let frameRender = 0;
  let framePhaser = 0;
  let frameGfx = 0;
  let frameGfxDrawn = 0;
  let frameGfxCommands = 0;
  let frameSync = 0;
  let frameUnits = 0;
  let battle: BattleScene | null = null;
  let battleFrames = 0;

  // Draw calls: every batch flush goes through WebGLRenderer.drawElements.
  const renderer = game.renderer as unknown as Record<string, unknown>;
  if (typeof renderer.drawElements === 'function') {
    wrap(renderer, 'drawElements', (call) => {
      frameDraws++;
      return call();
    });
  }

  wrap(Phaser.GameObjects.Text.prototype, 'setText', (call) => {
    if (recording) counters.setText++;
    return call();
  });
  wrap(Phaser.GameObjects.Text.prototype, 'updateText', (call) => {
    if (recording) counters.textRedraws++;
    return call();
  });
  wrap(Phaser.GameObjects.Graphics.prototype, 'clear', (call) => {
    if (recording) counters.graphicsClear++;
    return call();
  });

  const timed = (add: (ms: number) => void) => (call: () => unknown): unknown => {
    const t0 = performance.now();
    const out = call();
    add(performance.now() - t0);
    return out;
  };
  wrap(BattleScene.prototype, 'render', (call, self) => {
    battle = self as BattleScene;
    return timed((ms) => (frameRender += ms))(call);
  });
  wrap(BattleScene.prototype, 'tickOnce', (call) => {
    frameTicks++;
    return timed((ms) => (frameTick += ms))(call);
  });
  wrap(BattleScene.prototype, 'update', timed((ms) => (frameUpdate += ms)));
  wrap(NodeView.prototype, 'sync', timed((ms) => (frameSync += ms)));
  wrap(game.scene, 'render', timed((ms) => (framePhaser += ms)));
  // Time per Graphics object while recording (for graphicsTop): a WeakMap, entries made once per object.
  const gfxTime = new WeakMap<Phaser.GameObjects.Graphics, { ms: number }>();
  wrap(Phaser.GameObjects.Graphics.prototype, 'renderWebGL', (call, _self, args) => {
    const g = args[1] as Phaser.GameObjects.Graphics;
    if (g.commandBuffer.length > 0) {
      frameGfxDrawn++;
      frameGfxCommands += g.commandBuffer.length;
    }
    return timed((ms) => {
      frameGfx += ms;
      if (!recording) return;
      let entry = gfxTime.get(g);
      if (!entry) gfxTime.set(g, (entry = { ms: 0 }));
      entry.ms += ms;
    })(call);
  });
  wrap(UnitsView.prototype, 'render', timed((ms) => (frameUnits += ms)));

  // A fixed moment for screenshots: no tick past `stopAt`, units drawn exactly on the tick.
  if (stopAt !== null) {
    const world = (self: unknown): { tick: number } => (self as { world: { tick: number } }).world;
    wrap(BattleScene.prototype, 'tickOnce', (call, self) => (world(self).tick >= stopAt ? undefined : call()));
    // The dev FPS counter changes from run to run: hidden on reference screenshots.
    wrap(BattleScene.prototype, 'updateFps', (_call, self) => {
      (self as unknown as { fpsText: Phaser.GameObjects.Text | null }).fpsText?.setVisible(false);
      return undefined;
    });
    wrap(BattleScene.prototype, 'update', (call, self) => {
      if (world(self).tick < stopAt) return call();
      (self as unknown as { render(alpha: number): void }).render(0);
      return undefined;
    });
  }

  game.events.on(Phaser.Core.Events.PRE_STEP, () => {
    stepAt = performance.now();
    frameDraws = 0;
    frameUpdate = 0;
    frameTick = 0;
    frameTicks = 0;
    frameRender = 0;
    framePhaser = 0;
    frameGfx = 0;
    frameGfxDrawn = 0;
    frameGfxCommands = 0;
    frameSync = 0;
    frameUnits = 0;
  });
  game.events.on(Phaser.Core.Events.POST_RENDER, () => {
    const now = performance.now();
    const gap = lastFrameAt === 0 ? 0 : now - lastFrameAt;
    lastFrameAt = now;
    if (battle && firstFrames.length < 10) {
      // The first battle frames (PF-6): the scene's create happens before its first render.
      if (battleFrames++ < 10) firstFrames.push(Math.round(gap * 100) / 100);
    }
    if (!recording || frame >= MAX_FRAMES) return;
    interval[frame] = gap;
    work[frame] = now - stepAt;
    draws[frame] = frameDraws;
    updateMs[frame] = frameUpdate;
    tickMs[frame] = frameTick;
    ticks[frame] = frameTicks;
    renderMs[frame] = frameRender;
    phaserMs[frame] = framePhaser;
    gfxMs[frame] = frameGfx;
    gfxDrawn[frame] = frameGfxDrawn;
    gfxCommands[frame] = frameGfxCommands;
    syncMs[frame] = frameSync;
    unitsMs[frame] = frameUnits;
    frame++;
  });

  const api = {
    /** Starts a measurement window (after the warm-up). */
    start(): void {
      frame = 0;
      counters.setText = 0;
      counters.textRedraws = 0;
      counters.graphicsClear = 0;
      startedAt = performance.now();
      recording = true;
    },
    report(): ProfileReport {
      recording = false;
      const seconds = (performance.now() - startedAt) / 1000;
      const avg = (a: Float64Array): number => Math.round((a.subarray(0, frame).reduce((s, v) => s + v, 0) / Math.max(1, frame)) * 1000) / 1000;
      const scene = battle as unknown as { world: { tick: number; units: unknown[] } } | null;
      return {
        frames: frame,
        seconds: Math.round(seconds * 10) / 10,
        interval: stats(interval, frame),
        work: stats(work, frame),
        drawCalls: { avg: avg(draws), max: draws.subarray(0, frame).reduce((m, v) => Math.max(m, v), 0) },
        updateMs: avg(updateMs),
        tickMs: avg(tickMs),
        ticksPerFrame: avg(ticks),
        renderMs: avg(renderMs),
        phaserRenderMs: avg(phaserMs),
        graphicsMs: avg(gfxMs),
        graphicsDrawn: avg(gfxDrawn),
        graphicsCommands: avg(gfxCommands),
        syncMs: avg(syncMs),
        unitsMs: avg(unitsMs),
        setText: Math.round(counters.setText / seconds),
        textRedraws: Math.round(counters.textRedraws / seconds),
        graphicsClear: Math.round(counters.graphicsClear / seconds),
        units: scene?.world.units.length ?? 0,
        tick: scene?.world.tick ?? 0,
        firstFrames,
      };
    },
    /**
     * The heaviest Graphics of the battle: who owns them (parent class), depth, command count and the render time
     * per frame over the last measurement window (sorted by time if measured, else by commands).
     */
    graphicsTop(limit = 12): Array<{ owner: string; depth: number; commands: number; visible: boolean; msPerFrame: number }> {
      const out: Array<{ owner: string; depth: number; commands: number; visible: boolean; msPerFrame: number }> = [];
      const walk = (list: Phaser.GameObjects.GameObject[], owner: string): void => {
        for (const obj of list) {
          if (obj instanceof Phaser.GameObjects.Graphics) {
            const ms = (gfxTime.get(obj)?.ms ?? 0) / Math.max(1, frame);
            out.push({ owner, depth: obj.depth, commands: obj.commandBuffer.length, visible: obj.visible, msPerFrame: Math.round(ms * 1000) / 1000 });
          } else if (obj instanceof Phaser.GameObjects.Container) {
            walk(obj.list, obj.constructor.name);
          }
        }
      };
      if (battle) walk(battle.children.list, 'scene');
      return out.sort((x, y) => y.msPerFrame - x.msPerFrame || y.commands - x.commands).slice(0, limit);
    },
    /** A battle has rendered at least once. */
    inBattle(): boolean {
      return battle !== null;
    },
    /** The battle reached `stopAt` and everything shown has settled (display filter windows passed). */
    stopped(): boolean {
      const scene = battle as unknown as { world: { tick: number } } | null;
      return stopAt !== null && scene !== null && scene.world.tick >= stopAt;
    },
  };
  (window as unknown as { __profile: typeof api }).__profile = api;
}
