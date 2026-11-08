/** Small duration helpers shared by the gate UI, tickets and notifications. */

/** Whole minutes between two ISO timestamps (never negative). */
export function minutesBetween(startIso: string | Date, endIso: string | Date): number {
  const start = typeof startIso === 'string' ? new Date(startIso).getTime() : startIso.getTime();
  const end = typeof endIso === 'string' ? new Date(endIso).getTime() : endIso.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60_000));
}

/** Human duration: 95 → "1h 38m", 45 → "45m", 120 → "2h". */
export function formatDurationMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`;
  if (hours > 0) return `${hours}h`;
  return `${remainder}m`;
}
