/**
 * Look of a build menu button the player can't afford yet (docs/BUILD-BUTTON.md BB-3): `grey` — a greyed-out face
 * with a red price (BB-4), `fill` — a dark face that fills with gold as it is earned (BB-5). The flag
 * `BUILD_BUTTON.style` picks one; the URL parameter `?buildBtn=grey|fill` overrides it (also in production, to
 * compare both looks in the Yandex draft). TODO(design): remove the loser after the playtest (BB-6).
 */
export type BuildButtonStyle = 'grey' | 'fill';

/** `?buildBtn=grey|fill` → that style; anything else (or no parameter) → null, the flag decides. */
export function parseBuildButtonStyle(search: string): BuildButtonStyle | null {
  const value = new URLSearchParams(search).get('buildBtn');
  return value === 'grey' || value === 'fill' ? value : null;
}
