/**
 * Dev-only switches for profiling the battle (docs/PERF.md PF-7, docs/FX.md FX-0), from `?perf=a,b`:
 * - `nostars`  — the victory panel has no stars;
 * - `nofly`    — reward crystals don't fly, the counter shows the total at once;
 * - `notip`    — the victory panel has no tip lines;
 * - `nojingle` — no victory/defeat jingle or sound;
 * - `win` / `lose` — the battle ends by itself (victory / defeat) after PERF_AUTO_END_MS;
 * - `pause`    — the pause panel opens by itself after PERF_AUTO_END_MS;
 * - `nofx`     — none of the battle effects of docs/FX.md (A/B profiling and side-by-side looks).
 * Callers check `import.meta.env.DEV && perfFlag(...)`, so a production build drops the calls and this module.
 * Works on a phone too: open the dev server over the local network (`npm run dev -- --host`).
 */

/** When `win`, `lose` and `pause` act, ms after the battle starts. */
export const PERF_AUTO_END_MS = 2000;

export type PerfFlag = 'nostars' | 'nofly' | 'notip' | 'nojingle' | 'win' | 'lose' | 'pause' | 'nofx';

let flags: ReadonlySet<string> | null = null;

export function perfFlag(flag: PerfFlag): boolean {
  flags ??= new Set((new URLSearchParams(window.location.search).get('perf') ?? '').split(',').map((s) => s.trim()));
  return flags.has(flag);
}
