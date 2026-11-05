// Simulation benchmark (ARCHITECTURE.md «Производительность»): ~600 units on the field, 10 000 ticks, no rendering.
// Usage: npm run bench [-- --ticks 10000 --units 600]
// Budget: one tick ≤ 0.5 ms on a desktop PC. Not a Vitest test: timings are noisy, this only prints numbers.
// Loads the TypeScript core through Vite (like gen-level), so sources run as-is.
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';

const { values } = parseArgs({
  options: {
    ticks: { type: 'string', default: '10000' },
    units: { type: 'string', default: '600' },
  },
});
const TICKS = Number(values.ticks);
const TARGET_UNITS = Number(values.units);
const BUDGET_MS = 0.5;

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { createWorld } = await server.ssrLoadModule('/src/core/sim/World.ts');
  const { step } = await server.ssrLoadModule('/src/core/sim/tick.ts');
  const { createStress, stressStep } = await server.ssrLoadModule('/src/core/dev/stress.ts');
  const { STRESS_LEVEL } = await server.ssrLoadModule('/src/levels/index.ts');

  // The dev_stress level with the stress driver: garrisons kept full, every idle node streams to a neighbour,
  // extra units fill the field up to TARGET_UNITS (core/dev/stress.ts).
  const world = createWorld(STRESS_LEVEL, { seed: 1 });
  const stress = createStress();

  const times = new Float64Array(TICKS);
  let unitSum = 0;
  let maxUnits = 0;
  let events = 0;
  for (let t = 0; t < TICKS; t++) {
    const commands = stressStep(world, stress, TARGET_UNITS);
    unitSum += world.units.length;
    maxUnits = Math.max(maxUnits, world.units.length);

    const start = performance.now();
    events += step(world, commands).length;
    times[t] = performance.now() - start;
  }

  const sorted = Array.from(times).sort((a, b) => a - b);
  const avg = sorted.reduce((s, x) => s + x, 0) / TICKS;
  const pct = (p) => sorted[Math.min(TICKS - 1, Math.floor(TICKS * p))];
  const fmt = (ms) => `${ms.toFixed(3)} ms`;
  console.log(`ticks: ${TICKS}, units at tick start: avg ${Math.round(unitSum / TICKS)}, max ${maxUnits}; events: ${events}`);
  console.log(`tick time: avg ${fmt(avg)}, median ${fmt(pct(0.5))}, p99 ${fmt(pct(0.99))}, max ${fmt(sorted[TICKS - 1])}`);
  console.log(avg <= BUDGET_MS ? `OK: within the ${BUDGET_MS} ms budget` : `OVER BUDGET: ${BUDGET_MS} ms per tick`);
  process.exitCode = avg <= BUDGET_MS ? 0 : 1;
} finally {
  await server.close();
}
