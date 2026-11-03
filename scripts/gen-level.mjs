// Draft level generator CLI. Prints level JSON to stdout.
// Usage: npm run gen-level -- --seed 3 --nodes 8 --id c01_l06 --chapter 1 --index 6
// Loads src/core/level/generator.ts through Vite, so TypeScript sources run as-is.
import { parseArgs } from 'node:util';
import { createServer } from 'vite';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    nodes: { type: 'string', default: '8' },
    id: { type: 'string', default: 'draft' },
    chapter: { type: 'string', default: '1' },
    index: { type: 'string', default: '1' },
    veins: { type: 'string', default: '1' },
    aggression: { type: 'string', default: '0.3' },
    think: { type: 'string', default: '2000' },
    production: { type: 'string', default: '0.7' },
  },
});

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { generateLevel } = await server.ssrLoadModule('/src/core/level/generator.ts');
  const level = generateLevel({
    seed: Number(values.seed),
    id: values.id,
    chapter: Number(values.chapter),
    index: Number(values.index),
    nodeCount: Number(values.nodes),
    enemy: {
      productionMult: Number(values.production),
      aiThinkMs: Number(values.think),
      aggression: Number(values.aggression),
      startGold: 20,
    },
    playerStartGold: 20,
    baseTroops: 20,
    neutralTroops: [4, 9],
    goldVeinPairs: Number(values.veins),
  });
  console.log(JSON.stringify(level, null, 2));
} finally {
  await server.close();
}
