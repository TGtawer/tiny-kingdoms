/** Whole troops in a node (what the player sees). The epsilon absorbs float noise from production. */
export function visibleTroops(troops: number): number {
  return Math.floor(troops + 1e-9);
}
