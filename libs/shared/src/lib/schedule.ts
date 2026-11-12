import type { DaySchedule, SlotState, TimeWindow } from './power';

export const SLOTS_PER_DAY = 48;
export const SLOT_MINUTES = 30;

/** `YYYY-MM-DD` for a Date in the machine's local time zone. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local midnight for a `YYYY-MM-DD` key. */
export function startOfLocalDay(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Index of the half-hour slot that contains `date` (0–47, local time). */
export function slotIndexAt(date: Date): number {
  return date.getHours() * 2 + (date.getMinutes() >= SLOT_MINUTES ? 1 : 0);
}

/** Start time of slot `index` on the day described by `dateKey`. */
export function slotStart(dateKey: string, index: number): Date {
  const day = startOfLocalDay(dateKey);
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    0,
    index * SLOT_MINUTES,
  );
}

/**
 * Build a 48-slot day from hour ranges, e.g. `[[0, 4], [12, 16]]` = off 00:00–04:00 and 12:00–16:00.
 * Hours may be fractional in steps of 0.5. Everything else is `on`.
 */
export function scheduleFromOffRanges(
  dateKey: string,
  offRanges: ReadonlyArray<readonly [number, number]>,
  maybeRanges: ReadonlyArray<readonly [number, number]> = [],
): DaySchedule {
  const slots: SlotState[] = Array.from({ length: SLOTS_PER_DAY }, () => 'on');
  const paint = (
    ranges: ReadonlyArray<readonly [number, number]>,
    state: SlotState,
  ) => {
    for (const [from, to] of ranges) {
      for (let i = Math.round(from * 2); i < Math.round(to * 2); i++) {
        if (i >= 0 && i < SLOTS_PER_DAY) slots[i] = state;
      }
    }
  };
  paint(maybeRanges, 'maybe');
  paint(offRanges, 'off');
  return { date: dateKey, slots };
}

/** Contiguous `off` windows of a day, as ISO time windows. */
export function offWindows(day: DaySchedule): TimeWindow[] {
  const windows: TimeWindow[] = [];
  let startIdx: number | null = null;
  for (let i = 0; i <= day.slots.length; i++) {
    const isOff = i < day.slots.length && day.slots[i] === 'off';
    if (isOff && startIdx === null) startIdx = i;
    if (!isOff && startIdx !== null) {
      windows.push({
        start: slotStart(day.date, startIdx).toISOString(),
        end: slotStart(day.date, i).toISOString(),
      });
      startIdx = null;
    }
  }
  return mergeAdjacent(windows);
}

function mergeAdjacent(windows: TimeWindow[]): TimeWindow[] {
  const merged: TimeWindow[] = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && last.end === w.start) last.end = w.end;
    else merged.push({ ...w });
  }
  return merged;
}

/**
 * The cut in progress at `now`, or the next upcoming one, across the given days.
 * A cut running past midnight into the next day is merged into one window.
 */
export function findNextCut(
  days: ReadonlyArray<DaySchedule | null>,
  now: Date,
): TimeWindow | null {
  const all = mergeAdjacent(days.flatMap((d) => (d ? offWindows(d) : [])));
  const t = now.getTime();
  return all.find((w) => new Date(w.end).getTime() > t) ?? null;
}

/** Slot state at `now`, or `unknown` when the day isn't covered. */
export function slotStateAt(day: DaySchedule | null, now: Date): SlotState {
  if (!day || day.date !== localDateKey(now)) return 'unknown';
  return day.slots[slotIndexAt(now)] ?? 'unknown';
}

/** `h:mm` countdown, e.g. 2 h 46 min → `2:46`. Negative durations clamp to `0:00`. */
export function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
