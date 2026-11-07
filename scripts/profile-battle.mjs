// Battle render profile (docs/PERF.md PF-0). Starts the Vite dev server, opens battles in a headless Chrome/Edge
// with the CPU slowed down, and prints frame times, draw calls, render-side counters and garbage collection.
// Usage: npm run profile [-- --levels dev_stress,c01_l06,c01_l09 --seconds 30 --throttle 6 --size 1280x720]
//        npm run profile -- --shots   (reference screenshots at a fixed tick into docs/perf/baseline/)
// Browser: CHROME_PATH, or Chrome / Edge found in the usual places. The page side is src/dev/profiler.ts (?profile).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';

const { values } = parseArgs({
  options: {
    levels: { type: 'string', default: 'dev_stress,c01_l06,c01_l09' },
    seconds: { type: 'string', default: '30' },
    warmup: { type: 'string', default: '4' },
    throttle: { type: 'string', default: '6' },
    size: { type: 'string', default: '1280x720' },
    shots: { type: 'boolean', default: false },
    stopAt: { type: 'string', default: '200' },
    out: { type: 'string' },
  },
});

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const browserPath = BROWSERS.find((p) => existsSync(p));
if (!browserPath) {
  console.error('No Chrome/Edge found; set CHROME_PATH.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One headless browser page driven over the Chrome DevTools Protocol. */
async function openPage(width, height) {
  const port = 9400 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'tk-profile-'));
  const proc = spawn(
    browserPath,
    ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--mute-audio', `--window-size=${width},${height}`, 'about:blank'],
    { stdio: 'ignore' },
  );
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch {
      // Not up yet.
    }
  }
  if (!target) throw new Error('browser did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  const errors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    for (const fn of listeners.get(m.method) ?? []) fn(m.params);
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const on = (method, fn) => listeners.set(method, [...(listeners.get(method) ?? []), fn]);
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const close = () => {
    ws.close();
    proc.kill();
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 1000);
  };
  return { send, on, evaluate, errors, close };
}

/** Garbage collection over the window: minor/major GC per second and the freed KB/s (≈ allocation rate). */
function gcStats(events, seconds) {
  let minor = 0;
  let major = 0;
  let freed = 0;
  for (const e of events) {
    if (e.ph !== 'X' && e.ph !== 'B') continue;
    if (e.name === 'MinorGC' || e.name === 'MajorGC') {
      if (e.name === 'MinorGC') minor++;
      else major++;
      const before = e.args?.usedHeapSizeBefore;
      const after = e.args?.usedHeapSizeAfter;
      if (typeof before === 'number' && typeof after === 'number') freed += Math.max(0, before - after);
    }
  }
  return { minorPerSec: +(minor / seconds).toFixed(2), majorPerSec: +(major / seconds).toFixed(2), freedKBps: Math.round(freed / 1024 / seconds) };
}

async function profileLevel(base, level, width, height) {
  const page = await openPage(width, height);
  try {
    await page.send('Emulation.setCPUThrottlingRate', { rate: Number(values.throttle) });
    await page.send('Page.navigate', { url: `${base}?level=${level}&profile` });
    await sleep(Number(values.warmup) * 1000);
    const gpu = await page.evaluate(`(() => { const gl = document.querySelector('canvas')?.getContext('webgl2') ?? document.querySelector('canvas')?.getContext('webgl'); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`);
    const events = [];
    page.on('Tracing.dataCollected', (p) => events.push(...p.value));
    const done = new Promise((r) => page.on('Tracing.tracingComplete', r));
    await page.send('Tracing.start', { categories: 'devtools.timeline,v8,disabled-by-default-v8.gc', transferMode: 'ReportEvents' });
    await page.evaluate('window.__profile.start()');
    await sleep(Number(values.seconds) * 1000);
    const report = await page.evaluate('window.__profile.report()');
    await page.send('Tracing.end');
    await done;
    return { level, size: `${width}x${height}`, gpu, ...report, gc: gcStats(events, report.seconds), errors: page.errors };
  } finally {
    page.close();
  }
}

/** Screenshots at a fixed tick, twice, to show whether they are byte-identical between runs. */
async function shoot(base, level, width, height, dir) {
  const shots = [];
  for (let run = 0; run < 2; run++) {
    const page = await openPage(width, height);
    try {
      await page.send('Page.navigate', { url: `${base}?level=${level}&profile&stopAt=${values.stopAt}` });
      for (let i = 0; i < 300 && !(await page.evaluate('!!window.__profile && window.__profile.stopped()')); i++) await sleep(100);
      // Let the node display filter and short tweens settle on the frozen state.
      await sleep(1500);
      const r = await page.send('Page.captureScreenshot', { format: 'png' });
      shots.push(Buffer.from(r.result.data, 'base64'));
    } finally {
      page.close();
    }
  }
  const file = join(dir, `${level}_${width}x${height}_t${values.stopAt}.png`);
  writeFileSync(file, shots[0]);
  return { file, identical: shots[0].equals(shots[1]) };
}

const server = await createServer({ server: { port: 5310, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
try {
  if (values.shots) {
    const dir = 'docs/perf/baseline';
    mkdirSync(dir, { recursive: true });
    for (const [w, h] of [
      [360, 640],
      [1280, 720],
    ]) {
      for (const level of values.levels.split(',')) {
        const { file, identical } = await shoot(base, level, w, h, dir);
        console.log(`${file}  ${identical ? 'identical in two runs' : 'DIFFERS between runs'}`);
      }
    }
  } else {
    const [w, h] = values.size.split('x').map(Number);
    const results = [];
    for (const level of values.levels.split(',')) {
      const r = await profileLevel(base, level, w, h);
      results.push(r);
      console.log(`${level}: done (${r.frames} frames)${r.errors.length ? ` errors: ${r.errors.join(' | ')}` : ''}`);
    }
    console.log(`\nBrowser: ${browserPath}\nGPU: ${results[0]?.gpu}\nCPU throttling ×${values.throttle}, ${values.seconds} s per level after ${values.warmup} s warm-up, ${values.size}\n`);
    console.log('| level | frame avg / p95 / p99, ms | work avg / p95, ms | draw calls avg / max | update (sim ticks, ×per frame) / render / sync / units, ms per frame | Phaser render / of it Graphics, ms (Graphics drawn, commands) | setText / redraws / Graphics.clear per s | minor GC/s, freed KB/s | units | first frames, ms |');
    console.log('|---|---|---|---|---|---|---|---|---|---|');
    for (const r of results) {
      console.log(
        `| ${r.level} | ${r.interval.avg} / ${r.interval.p95} / ${r.interval.p99} | ${r.work.avg} / ${r.work.p95} | ${r.drawCalls.avg} / ${r.drawCalls.max} | ${r.updateMs} (${r.tickMs}, ×${r.ticksPerFrame}) / ${r.renderMs} / ${r.syncMs} / ${r.unitsMs} | ${r.phaserRenderMs} / ${r.graphicsMs} (${r.graphicsDrawn}, ${r.graphicsCommands}) | ${r.setText} / ${r.textRedraws} / ${r.graphicsClear} | ${r.gc.minorPerSec}, ${r.gc.freedKBps} | ${r.units} | ${r.firstFrames.slice(0, 5).join(', ')} |`,
      );
    }
    if (values.out) {
      writeFileSync(values.out, JSON.stringify({ browser: browserPath, throttle: Number(values.throttle), seconds: Number(values.seconds), results }, null, 2));
      console.log(`\nSaved ${values.out}`);
    }
  }
} finally {
  await server.close();
}
