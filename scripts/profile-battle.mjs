// Battle render profile (docs/PERF.md PF-0). Starts the Vite dev server, opens battles in a headless Chrome/Edge
// with the CPU slowed down, and prints frame times, draw calls, render-side counters and garbage collection.
// Usage: npm run profile [-- --levels dev_stress,c01_l06,c01_l09 --seconds 30 --throttle 6 --size 1280x720]
//        npm run profile -- --shots   (reference screenshots at a fixed tick into docs/perf/baseline/)
//        npm run profile -- --shots --dir docs/perf/after --compare docs/perf/baseline   (shots elsewhere, compared)
//        npm run profile -- --result [--throttles 4,6 --runs 3 --level c01_l06 --variants victory,nostars,...]
//          the battle result screen (PF-7): each variant ends the battle by a dev flag (?perf=win|lose|pause, see
//          src/dev/perfFlags.ts), waits for the panel to settle, then records frames; medians over the runs.
//        npm run profile -- --result --cpuprofile --variants victory,nostars   (+ where the frame time goes)
//        --perf nofx: extra dev flags for the battle page (?perf=..., src/dev/perfFlags.ts), e.g. A/B of docs/FX.md effects
//        --mobile: an Android user agent, so Phaser renders as on a phone (autoMobileTextures: one texture per batch)
// Browser: CHROME_PATH, or Chrome / Edge found in the usual places. The page side is src/dev/profiler.ts (?profile).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
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
    dir: { type: 'string', default: 'docs/perf/baseline' },
    compare: { type: 'string' },
    result: { type: 'boolean', default: false },
    throttles: { type: 'string', default: '4,6' },
    runs: { type: 'string', default: '3' },
    level: { type: 'string', default: 'c01_l06' },
    variants: { type: 'string', default: 'victory,nostars,nofly,nostars+nofly,notip,nojingle,defeat,pause' },
    settle: { type: 'string', default: '6' },
    record: { type: 'string', default: '10' },
    cpuprofile: { type: 'boolean', default: false },
    mobile: { type: 'boolean', default: false },
    perf: { type: 'string', default: '' },
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
  // Phaser reads the user agent: as Android it batches one texture per draw call (autoMobileTextures), like a phone.
  if (values.mobile) {
    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  }
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
    await page.send('Page.navigate', { url: `${base}?level=${level}&profile${values.perf ? `&perf=${values.perf}` : ''}` });
    // The first load after a code change can take a while (Vite prepares dependencies, may reload once).
    for (let i = 0; i < 300 && !(await page.evaluate('!!window.__profile && window.__profile.inBattle()')); i++) await sleep(100);
    await sleep(Number(values.warmup) * 1000);
    const gpu = await page.evaluate(`(() => { const gl = document.querySelector('canvas')?.getContext('webgl2') ?? document.querySelector('canvas')?.getContext('webgl'); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`);
    const events = [];
    page.on('Tracing.dataCollected', (p) => events.push(...p.value));
    const done = new Promise((r) => page.on('Tracing.tracingComplete', r));
    await page.send('Tracing.start', { categories: 'devtools.timeline,v8,disabled-by-default-v8.gc', transferMode: 'ReportEvents' });
    await page.evaluate('window.__profile.start()');
    await sleep(Number(values.seconds) * 1000);
    const report = await page.evaluate('window.__profile.report()');
    report.graphicsTop = await page.evaluate('window.__profile.graphicsTop(8)');
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
      await page.send('Page.navigate', { url: `${base}?level=${level}&profile&stopAt=${values.stopAt}${values.perf ? `&perf=${values.perf}` : ''}` });
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

/** Result-screen variants (PF-7): the `?perf=` flags of each. */
const VARIANTS = {
  victory: 'win',
  nostars: 'win,nostars',
  nofly: 'win,nofly',
  'nostars+nofly': 'win,nostars,nofly',
  notip: 'win,notip',
  nojingle: 'win,nojingle',
  defeat: 'lose',
  pause: 'pause',
};

/** Self time per function from a CDP CPU profile, ms, the heaviest first. */
function cpuTop(profile, limit = 14) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  profile.samples.forEach((id, i) => {
    const node = byId.get(id);
    const f = node.callFrame;
    const file = f.url ? f.url.split('/').pop().split('?')[0] : '';
    const key = `${f.functionName || '(anonymous)'}${file ? ` ${file}:${f.lineNumber + 1}` : ''}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  return { totalMs: Math.round(total), top: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, ms]) => [k, Math.round(ms)]) };
}

/** One result-screen measurement: battle → the dev flag ends it → panel settles → frames recorded. */
async function profileResult(base, variant, throttle, cpu) {
  const page = await openPage(1280, 720);
  try {
    await page.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.send('Page.navigate', { url: `${base}?level=${values.level}&profile&perf=${VARIANTS[variant]}` });
    for (let i = 0; i < 300 && !(await page.evaluate('!!window.__profile && window.__profile.inBattle()')); i++) await sleep(100);
    for (let i = 0; i < 300; i++) {
      const st = await page.evaluate('window.__profile.state()');
      if (st.ended || st.paused) break;
      await sleep(100);
    }
    // Result delay, crystal flight and count, then 3 s more (the panel is still).
    await sleep(Number(values.settle) * 1000);
    if (cpu) {
      await page.send('Profiler.enable');
      await page.send('Profiler.setSamplingInterval', { interval: 200 });
      await page.send('Profiler.start');
    }
    await page.evaluate('window.__profile.start()');
    await sleep(Number(values.record) * 1000);
    const report = await page.evaluate('window.__profile.report()');
    if (cpu) report.cpu = cpuTop((await page.send('Profiler.stop')).result.profile);
    return report;
  } finally {
    page.close();
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round(((s[s.length / 2 - 1] + s[s.length / 2]) / 2) * 100) / 100;
};

const server = await createServer({ server: { port: 5310, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
try {
  if (values.result) {
    const variants = values.variants.split(',');
    const throttles = values.throttles.split(',').map(Number);
    const runs = values.cpuprofile ? 1 : Number(values.runs);
    const rows = [];
    for (const throttle of throttles) {
      for (const variant of variants) {
        const reports = [];
        for (let r = 0; r < runs; r++) {
          const rep = await profileResult(base, variant, throttle, values.cpuprofile);
          reports.push(rep);
          console.log(`×${throttle} ${variant} run ${r + 1}: frame ${rep.interval.avg} / ${rep.interval.p95} / ${rep.interval.p99} ms, draws ${rep.drawCalls.avg}, Graphics ${rep.graphicsMs} ms (${rep.graphicsDrawn})`);
          if (rep.cpu) {
            console.log(`  CPU profile, ${values.record} s, self time total ${rep.cpu.totalMs} ms:`);
            for (const [k, ms] of rep.cpu.top) console.log(`    ${String(ms).padStart(6)} ms  ${k}`);
          }
        }
        const m = (f) => median(reports.map(f));
        rows.push({
          throttle,
          variant,
          avg: m((r) => r.interval.avg),
          p95: m((r) => r.interval.p95),
          p99: m((r) => r.interval.p99),
          work: m((r) => r.work.avg),
          draws: m((r) => r.drawCalls.avg),
          gfxMs: m((r) => r.graphicsMs),
          gfx: m((r) => r.graphicsDrawn),
          phaser: m((r) => r.phaserRenderMs),
          update: m((r) => r.updateMs),
        });
      }
    }
    console.log(`\nResult screen, ${values.level}, 1280x720, medians of ${runs} run(s); recorded ${values.record} s after ${values.settle} s of settling\n`);
    console.log('| CPU | variant | frame avg / p95 / p99, ms | work avg, ms | draw calls | Phaser render / of it Graphics, ms (Graphics drawn) | battle update, ms |');
    console.log('|---|---|---|---|---|---|---|');
    for (const r of rows) console.log(`| ×${r.throttle} | ${r.variant} | ${r.avg} / ${r.p95} / ${r.p99} | ${r.work} | ${r.draws} | ${r.phaser} / ${r.gfxMs} (${r.gfx}) | ${r.update} |`);
    if (values.out) writeFileSync(values.out, JSON.stringify({ level: values.level, runs, rows }, null, 2));
  } else if (values.shots) {
    const dir = values.dir;
    mkdirSync(dir, { recursive: true });
    for (const [w, h] of [
      [360, 640],
      [1280, 720],
    ]) {
      for (const level of values.levels.split(',')) {
        const { file, identical } = await shoot(base, level, w, h, dir);
        let vs = '';
        if (values.compare) {
          const ref = join(values.compare, basename(file));
          vs = existsSync(ref) ? (readFileSync(ref).equals(readFileSync(file)) ? ', same as the reference' : ', DIFFERS from the reference') : ', no reference';
        }
        console.log(`${file}  ${identical ? 'identical in two runs' : 'DIFFERS between runs'}${vs}`);
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
    console.log(`\nBrowser: ${browserPath}\nGPU: ${results[0]?.gpu}\nCPU throttling ×${values.throttle}, ${values.seconds} s per level after ${values.warmup} s warm-up, ${values.size}${values.perf ? `, perf=${values.perf}` : ''}\n`);
    console.log('| level | frame avg / p95 / p99, ms | work avg / p95, ms | draw calls avg / max | update (sim ticks, ×per frame) / render / sync / units, ms per frame | Phaser render / of it Graphics, ms (Graphics drawn, commands) | setText / redraws / Graphics.clear per s | minor GC/s, freed KB/s | units | first frames, ms |');
    console.log('|---|---|---|---|---|---|---|---|---|---|');
    for (const r of results) {
      console.log(
        `| ${r.level} | ${r.interval.avg} / ${r.interval.p95} / ${r.interval.p99} | ${r.work.avg} / ${r.work.p95} | ${r.drawCalls.avg} / ${r.drawCalls.max} | ${r.updateMs} (${r.tickMs}, ×${r.ticksPerFrame}) / ${r.renderMs} / ${r.syncMs} / ${r.unitsMs} | ${r.phaserRenderMs} / ${r.graphicsMs} (${r.graphicsDrawn}, ${r.graphicsCommands}) | ${r.setText} / ${r.textRedraws} / ${r.graphicsClear} | ${r.gc.minorPerSec}, ${r.gc.freedKBps} | ${r.units} | ${r.firstFrames.slice(0, 5).join(', ')} |`,
      );
    }
    console.log('');
    console.log('Heaviest Graphics (ms per frame, commands, owner):');
    for (const r of results) console.log(`${r.level}: ${r.graphicsTop.map((g) => `${g.msPerFrame} (${g.commands}, ${g.owner})`).join('; ')}`);
    if (values.out) {
      writeFileSync(values.out, JSON.stringify({ browser: browserPath, throttle: Number(values.throttle), seconds: Number(values.seconds), results }, null, 2));
      console.log(`\nSaved ${values.out}`);
    }
  }
} finally {
  await server.close();
}
