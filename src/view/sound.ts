// Sound effects: a file public/audio/sfx_<id>.mp3 when SFX.files lists it, otherwise synthesized with Web Audio
// (CLAUDE.md rule 8, docs/AUDIO.md A-4). One entry point, playSfx(id). Sound is muted by the player setting and
// suspended while the tab is hidden or an ad is shown (Yandex requirement).

import { SFX } from '../config/game';
import { audioContext, audioUrl, isAudioSuspended, loadBuffer, resumeAudio, setAudioSuspended } from './audioContext';

export type SfxId = 'send' | 'capture' | 'lost' | 'build' | 'fireball' | 'victory' | 'defeat' | 'click';

type Wave = OscillatorType;

interface Note {
  /** Start offset, s. */
  at: number;
  freq: number;
  /** Frequency at the end of the note (pitch slide); defaults to `freq`. */
  to?: number;
  dur: number;
  wave: Wave;
  gain: number;
}

/** Each effect is a few short notes; `noise` adds a filtered noise burst (impacts). */
const EFFECTS: Record<SfxId, { notes: Note[]; noise?: { dur: number; gain: number; cutoff: number } }> = {
  click: { notes: [{ at: 0, freq: 880, to: 660, dur: 0.05, wave: 'square', gain: 0.12 }] },
  send: { notes: [{ at: 0, freq: 320, to: 520, dur: 0.12, wave: 'triangle', gain: 0.35 }] },
  build: {
    notes: [
      { at: 0, freq: 523, dur: 0.08, wave: 'square', gain: 0.15 },
      { at: 0.08, freq: 784, dur: 0.12, wave: 'square', gain: 0.15 },
    ],
  },
  capture: {
    notes: [
      { at: 0, freq: 523, dur: 0.09, wave: 'triangle', gain: 0.4 },
      { at: 0.08, freq: 659, dur: 0.09, wave: 'triangle', gain: 0.4 },
      { at: 0.16, freq: 784, dur: 0.16, wave: 'triangle', gain: 0.4 },
    ],
  },
  lost: {
    notes: [
      { at: 0, freq: 392, dur: 0.12, wave: 'sawtooth', gain: 0.18 },
      { at: 0.11, freq: 294, to: 260, dur: 0.22, wave: 'sawtooth', gain: 0.18 },
    ],
  },
  fireball: {
    notes: [{ at: 0, freq: 180, to: 60, dur: 0.4, wave: 'sawtooth', gain: 0.25 }],
    noise: { dur: 0.45, gain: 0.5, cutoff: 1200 },
  },
  victory: {
    notes: [
      { at: 0, freq: 523, dur: 0.14, wave: 'triangle', gain: 0.4 },
      { at: 0.14, freq: 659, dur: 0.14, wave: 'triangle', gain: 0.4 },
      { at: 0.28, freq: 784, dur: 0.14, wave: 'triangle', gain: 0.4 },
      { at: 0.42, freq: 1047, dur: 0.4, wave: 'triangle', gain: 0.45 },
    ],
  },
  defeat: {
    notes: [
      { at: 0, freq: 392, dur: 0.22, wave: 'triangle', gain: 0.35 },
      { at: 0.22, freq: 330, dur: 0.22, wave: 'triangle', gain: 0.35 },
      { at: 0.44, freq: 262, to: 220, dur: 0.5, wave: 'triangle', gain: 0.35 },
    ],
  },
};

let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let enabled = true;
/** Decoded effect files by id. */
const files = new Map<SfxId, AudioBuffer>();

function output(): { ctx: AudioContext; master: GainNode } | null {
  const ctx = audioContext();
  if (!ctx) return null;
  if (!master) {
    master = ctx.createGain();
    master.gain.value = SFX.volume;
    master.connect(ctx.destination);
  }
  return { ctx, master };
}

/** Player setting: sound on/off. */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/** Tab hidden or ad shown: stop all audio (effects and music share the context) until resumed. */
export function setSoundSuspended(value: boolean): void {
  setAudioSuspended(value);
}

/** Loads and decodes the effect files in the background; until one is ready its synth version plays. */
export function preloadSfx(): void {
  for (const id of SFX.files as readonly SfxId[]) {
    if (files.has(id)) continue;
    void loadBuffer(audioUrl(`sfx_${id}`)).then((buffer) => {
      if (buffer) files.set(id, buffer);
    });
  }
}

export function playSfx(id: SfxId): void {
  if (!enabled || isAudioSuspended()) return;
  const out = output();
  if (!out) return;
  const { ctx, master } = out;
  // Browsers start the context suspended until a user gesture; the first tap resumes it.
  resumeAudio();

  const file = files.get(id);
  if (file) {
    const src = ctx.createBufferSource();
    src.buffer = file;
    const gain = ctx.createGain();
    gain.gain.value = SFX.fileVolume;
    src.connect(gain).connect(master);
    src.start(ctx.currentTime, Math.min(SFX.fileOffsetSec, file.duration));
    return;
  }

  const now = ctx.currentTime + 0.01;
  const effect = EFFECTS[id];
  for (const note of effect.notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.wave;
    const start = now + note.at;
    const end = start + note.dur;
    osc.frequency.setValueAtTime(note.freq, start);
    if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, end);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(note.gain, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(end + 0.02);
  }

  if (effect.noise) {
    const { dur, gain: level, cutoff } = effect.noise;
    noiseBuffer ??= makeNoise(ctx);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(now);
    src.stop(now + dur);
  }
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Deterministic pseudo-noise (no Math.random needed).
  let seed = 1;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 16807) % 2147483647;
    data[i] = (seed / 2147483647) * 2 - 1;
  }
  return buffer;
}
