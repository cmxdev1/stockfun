/** Client-safe mirror of the XP curve in `store.ts` (which is server-only). */
export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 120)) + 1);
}
