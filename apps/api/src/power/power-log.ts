import type { GridStatus } from '@side-screen/shared';
import type { PowerEvent } from '../storage/storage';

const WEEK_MS = 7 * 24 * 3_600_000;

/**
 * Hours spent OFF within [now − 7 days, now], from status-change events in time order
 * (the first may predate the window). UNCONFIRMED doesn't count as off.
 */
export function offHoursInWindow(
  events: PowerEvent[],
  now: number,
  windowMs = WEEK_MS,
): number {
  const from = now - windowMs;
  let offMs = 0;
  for (let i = 0; i < events.length; i++) {
    if (events[i].status !== 'OFF') continue;
    const start = Math.max(events[i].at, from);
    const end = Math.min(events[i + 1]?.at ?? now, now);
    if (end > start) offMs += end - start;
  }
  return Math.round((offMs / 3_600_000) * 10) / 10;
}

export function isGridStatus(value: string): value is GridStatus {
  return value === 'ON' || value === 'OFF' || value === 'UNCONFIRMED';
}

export { WEEK_MS };
