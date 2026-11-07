// Music and jingles (docs/AUDIO.md A-1). One entry point for all of it.
// Music streams through an <audio> element (a 3-minute track decoded to PCM would take tens of MB),
// routed into the shared Web Audio context for crossfades and the suspend on hidden tab / ads.
// Jingles are short: decoded once and played from a buffer.
// A track without a file (not listed in MUSIC.files) is silence, never an error.

import { MUSIC, type JingleId, type MusicId } from '../config/game';
import { audioContext, audioUrl, loadBuffer, onAudioUnlock, resumeAudio } from './audioContext';

interface Track {
  el: HTMLAudioElement;
  /** Fade gain of this track; null without Web Audio (the element volume is used then). */
  gain: GainNode | null;
  /** Pending pause after a fade-out. */
  stopTimer: ReturnType<typeof setTimeout> | null;
  /** The file failed to load: don't retry on every tap. */
  missing: boolean;
}

const available: ReadonlySet<MusicId | JingleId> = new Set(MUSIC.files);
const tracks = new Map<MusicId, Track>();
const jingleBuffers = new Map<JingleId, AudioBuffer>();
let current: { id: MusicId; track: Track } | null = null;
let bus: GainNode | null = null;
let jingle: AudioBufferSourceNode | null = null;
let enabled = true;
let suspended = false;
let ducked = false;
/** Player volume, 0..1, on top of MUSIC.volume and MUSIC.jingleVolume. */
let volume = 1;

/** IDs that have a file in public/audio/ (playlist fallbacks are decided by this set). */
export function audioFiles(): ReadonlySet<MusicId | JingleId> {
  return available;
}

/** Starts loading the menu track and the jingles; call after the game has signalled readiness. */
export function preloadMusic(): void {
  if (available.has('music_menu')) getTrack('music_menu');
  for (const id of available) {
    if (!id.startsWith('jingle_') || jingleBuffers.has(id as JingleId)) continue;
    void loadBuffer(audioUrl(id)).then((buffer) => {
      if (buffer) jingleBuffers.set(id as JingleId, buffer);
    });
  }
}

/**
 * Plays a looped track with a crossfade. The same track again keeps playing (menu → map → upgrades
 * without a cut); null or a track without a file fades the music out.
 */
export function playMusic(id: MusicId | null): void {
  const next = id !== null && available.has(id) ? id : null;
  if (current?.id === next) return;
  if (current) fadeOut(current.track, MUSIC.crossfadeMs);
  stopJingle();
  current = next ? { id: next, track: getTrack(next) } : null;
  if (!current) return;
  // A new track starts from the top; one caught mid fade-out just comes back.
  if (current.track.el.paused) current.track.el.currentTime = 0;
  start(current.track);
}

/** Fades the music out (battle end). The next playMusic starts its track from the top. */
export function stopMusic(fadeMs: number = MUSIC.crossfadeMs): void {
  if (current) fadeOut(current.track, fadeMs);
  current = null;
}

/** Whether `playJingle(id)` would sound right now (music on and the file decoded). */
export function canPlayJingle(id: JingleId | null): id is JingleId {
  return id !== null && enabled && !suspended && jingleBuffers.has(id);
}

/** Plays a jingle once; returns false when it can't (then the caller plays the synthesized effect). */
export function playJingle(id: JingleId | null): boolean {
  const ctx = audioContext();
  if (!ctx || !canPlayJingle(id)) return false;
  resumeAudio();
  stopJingle();
  const src = ctx.createBufferSource();
  src.buffer = jingleBuffers.get(id) ?? null;
  const gain = ctx.createGain();
  gain.gain.value = MUSIC.jingleVolume * volume;
  src.connect(gain).connect(ctx.destination);
  src.onended = () => {
    if (jingle === src) jingle = null;
  };
  src.start();
  jingle = src;
  return true;
}

/** Player setting: music and jingles on/off. */
export function setMusicEnabled(on: boolean): void {
  enabled = on;
  if (!on) stopJingle();
  if (!current) return;
  if (on) start(current.track);
  else fadeOut(current.track, MUSIC.endFadeMs);
}

export function isMusicEnabled(): boolean {
  return enabled;
}

/**
 * Player setting: music volume 0..1 (a multiplier on MUSIC.volume). Applies at once, without restarting the track:
 * it scales the shared bus, so the pause duck and the crossfades between tracks keep working on top of it.
 */
export function setMusicVolume(v: number): void {
  volume = v;
  const ctx = audioContext();
  if (bus && ctx) {
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(busLevel(), ctx.currentTime);
  } else if (current && !current.track.gain && !current.track.el.paused) {
    current.track.el.volume = busLevel();
  }
}

export function getMusicVolume(): number {
  return volume;
}

/** Tab hidden or ad shown: a full stop, the track continues from the same place on resume. */
export function setMusicSuspended(value: boolean): void {
  suspended = value;
  if (value) {
    for (const track of tracks.values()) {
      clearStop(track);
      track.el.pause();
    }
    stopJingle();
  } else if (current && enabled) {
    start(current.track);
  }
}

/** Battle pause panel: the music goes quieter but keeps playing. */
export function setMusicDucked(value: boolean): void {
  ducked = value;
  const ctx = audioContext();
  if (bus && ctx) ramp(bus.gain, ctx, busLevel(), MUSIC.endFadeMs);
  else if (current) current.track.el.volume = busLevel();
}

// A track asked for before the first tap could not start (autoplay policy): start it on the gesture.
// Runs inside the gesture handler, so play() is allowed on iOS too.
onAudioUnlock(() => {
  if (current && enabled && !suspended && current.track.el.paused && !current.track.missing) start(current.track);
});

function busLevel(): number {
  return MUSIC.volume * volume * (ducked ? MUSIC.pauseDuck : 1);
}

function getTrack(id: MusicId): Track {
  const existing = tracks.get(id);
  if (existing) return existing;
  const el = new Audio();
  el.loop = true;
  el.preload = 'auto';
  const track: Track = { el, gain: null, stopTimer: null, missing: false };
  el.addEventListener('error', () => {
    track.missing = true;
  });
  el.src = audioUrl(id);

  const ctx = audioContext();
  if (ctx) {
    try {
      if (!bus) {
        bus = ctx.createGain();
        bus.gain.value = busLevel();
        bus.connect(ctx.destination);
      }
      track.gain = ctx.createGain();
      track.gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(track.gain).connect(bus);
    } catch {
      track.gain = null;
    }
  }
  if (!track.gain) el.volume = 0;
  tracks.set(id, track);
  return track;
}

function start(track: Track): void {
  clearStop(track);
  if (!enabled || suspended || track.missing) return;
  resumeAudio();
  void track.el.play().catch(() => undefined);
  fade(track, 1, MUSIC.crossfadeMs);
}

function fadeOut(track: Track, ms: number): void {
  fade(track, 0, ms);
  clearStop(track);
  track.stopTimer = setTimeout(() => {
    track.stopTimer = null;
    track.el.pause();
  }, ms);
}

function fade(track: Track, to: number, ms: number): void {
  const ctx = audioContext();
  if (track.gain && ctx) ramp(track.gain.gain, ctx, to, ms);
  // No Web Audio: no smooth fade, the volume just switches.
  else track.el.volume = to * busLevel();
}

function ramp(param: AudioParam, ctx: AudioContext, to: number, ms: number): void {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(to, now + ms / 1000);
}

function clearStop(track: Track): void {
  if (track.stopTimer === null) return;
  clearTimeout(track.stopTimer);
  track.stopTimer = null;
}

function stopJingle(): void {
  if (!jingle) return;
  try {
    jingle.stop();
  } catch {
    // Already ended.
  }
  jingle = null;
}
