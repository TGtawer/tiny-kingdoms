// The one Web Audio context shared by effects (sound.ts) and music (music.ts).
// Browsers keep audio locked until a user gesture: the first tap or key resumes the context
// and tells the listeners (music retries the track it was asked to play).

let context: AudioContext | null = null;
let failed = false;
let suspended = false;
const unlockListeners: Array<() => void> = [];

export function audioContext(): AudioContext | null {
  if (context || failed) return context;
  const Ctor = typeof window === 'undefined' ? undefined : window.AudioContext;
  if (!Ctor) {
    failed = true;
    return null;
  }
  try {
    context = new Ctor();
  } catch {
    failed = true;
    return null;
  }
  listenForGesture();
  return context;
}

/** Called on every user gesture (tap, key) while audio is not suspended. */
export function onAudioUnlock(listener: () => void): void {
  unlockListeners.push(listener);
}

/** Tab hidden or ad shown: the whole context is suspended (Yandex requirement). */
export function setAudioSuspended(value: boolean): void {
  suspended = value;
  if (!context) return;
  void (value ? context.suspend() : context.resume()).catch(() => undefined);
}

export function isAudioSuspended(): boolean {
  return suspended;
}

/** Resumes a context the browser started suspended; harmless when it already runs. */
export function resumeAudio(): void {
  if (!context || suspended || context.state !== 'suspended') return;
  void context.resume().catch(() => undefined);
}

function listenForGesture(): void {
  if (typeof document === 'undefined') return;
  const unlock = (): void => {
    if (!context || suspended) return;
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    // Synchronously, inside the gesture: iOS allows media play() only there.
    for (const listener of unlockListeners) listener();
  };
  // Every gesture, not once: a media element may still refuse to play after the first one (iOS).
  for (const type of ['pointerdown', 'keydown', 'touchend'] as const) document.addEventListener(type, unlock, { capture: true });
}

/** Fetches and decodes a short file (effects, jingles); null when it is missing or broken. */
export async function loadBuffer(url: string): Promise<AudioBuffer | null> {
  const ctx = audioContext();
  if (!ctx) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/** URL of public/audio/<id>.mp3 (relative: the build is served from a sub-path). */
export function audioUrl(id: string): string {
  return `audio/${id}.mp3`;
}
