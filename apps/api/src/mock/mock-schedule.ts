import {
  type DaySchedule,
  localDateKey,
  scheduleFromOffRanges,
  slotIndexAt,
  slotStart,
} from '@side-screen/shared';

/** Mock DTEK group; the real one comes from the address lookup in phase 2. */
export const MOCK_GROUP = '38.1';

/** Mock schedule shaped like the Mix artboard: cuts 00–04, 12–16 and 23–24, a "maybe" hour at 04–05. */
export function mockToday(now: Date): DaySchedule {
  return scheduleFromOffRanges(
    localDateKey(now),
    [
      [0, 4],
      [12, 16],
      [23, 24],
    ],
    [[4, 5]],
  );
}

/** DTEK usually publishes tomorrow in the evening; the mock does the same from 18:00. */
export function mockTomorrow(now: Date): DaySchedule | null {
  if (now.getHours() < 18) return null;
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return scheduleFromOffRanges(localDateKey(tomorrow), [
    [0, 2],
    [8, 12],
    [19, 23],
  ]);
}

/** Start of the current on/off run, walking back from `now` within the day. */
export function runStart(day: DaySchedule, now: Date): Date {
  const isOff = (i: number) => day.slots[i] === 'off';
  const current = slotIndexAt(now);
  let i = current;
  while (i > 0 && isOff(i - 1) === isOff(current)) i--;
  return slotStart(day.date, i);
}
