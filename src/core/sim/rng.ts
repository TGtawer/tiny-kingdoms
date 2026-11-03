// Seeded PRNG (mulberry32). State is a plain number stored in World, so the world stays serializable.

/** Advances the state and returns [value in [0, 1), next state]. */
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

export function seedState(seed: number): number {
  return seed | 0;
}
