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

/** 5 × 4 grid of large nodes with level 3 barracks, roads between grid neighbours; columns alternate sides. */
function stressLevel() {
  const cols = 5;
  const rows = 4;
  const nodes = [];
  const roads = [];
  const id = (c, r) => `n${r}_${c}`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push({
        id: id(c, r),
        x: 0.08 + (0.84 * c) / (cols - 1),
        y: 0.1 + (0.8 * r) / (rows - 1),
        size: 'large',
        owner: (c + r) % 2 === 0 ? 'player' : 'enemy',
        troops: 60,
        hasGoldVein: false,
        building: { type: 'barracks', level: 3 },
      });
      if (c > 0) roads.push([id(c - 1, r), id(c, r)]);
      if (r > 0) roads.push([id(c, r - 1), id(c, r)]);
    }
  }
  return {
    id: 'bench',
    chapter: 0,
    index: 0,
    nodes,
    roads,
    enemy: { productionMult: 1, aiThinkMs: 1000, aggression: 0.5, startGold: 0 },
    playerStartGold: 0,
  };
}

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { createWorld } = await server.ssrLoadModule('/src/core/sim/World.ts');
  const { step } = await server.ssrLoadModule('/src/core/sim/tick.ts');
  const { spawnUnit } = await server.ssrLoadModule('/src/core/sim/units.ts');

  const world = createWorld(stressLevel(), { seed: 1 });
  const nodes = Object.values(world.nodes);
  // Every node streams to each neighbour of the other side in turn; garrisons are topped up so no node ever falls
  // and the streams never stop. Extra units fill the field up to TARGET_UNITS (on random roads, both ways).
  const neighbours = new Map(nodes.map((n) => [n.id, []]));
  for (const [a, b] of world.roads) {
    neighbours.get(a).push(b);
    neighbours.get(b).push(a);
  }
  let rng = 12345;
  const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  const times = new Float64Array(TICKS);
  let unitSum = 0;
  let maxUnits = 0;
  let events = 0;
  for (let t = 0; t < TICKS; t++) {
    const commands = [];
    for (const n of nodes) {
      n.troops = Math.max(n.troops, 60);
      if (n.streamId === null) {
        const list = neighbours.get(n.id);
        const to = list[Math.floor(rand() * list.length)];
        commands.push({ type: 'send', side: n.owner, from: n.id, to });
      }
    }
    while (world.units.length < TARGET_UNITS) {
      const lane = Math.floor(rand() * world.lanes.length);
      const l = world.lanes[lane];
      spawnUnit(world, world.nodes[l.from].owner, [l.from, l.to], [lane], rand() * 0.9);
    }
    world.winner = null;
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
