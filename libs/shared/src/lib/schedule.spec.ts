/* eslint-disable @typescript-eslint/no-non-null-assertion -- asserting known fixtures */
import {
  findNextCut,
  formatCountdown,
  localDateKey,
  offWindows,
  scheduleFromOffRanges,
  slotIndexAt,
  slotStateAt,
} from './schedule';

const at = (h: number, m = 0, day = 12) => new Date(2026, 10, day, h, m);

describe('schedule helpers', () => {
  it('maps a time to its half-hour slot', () => {
    expect(slotIndexAt(at(0, 0))).toBe(0);
    expect(slotIndexAt(at(0, 29))).toBe(0);
    expect(slotIndexAt(at(0, 30))).toBe(1);
    expect(slotIndexAt(at(23, 59))).toBe(47);
  });

  it('builds 48 slots with off and maybe ranges', () => {
    const day = scheduleFromOffRanges('2026-11-12', [[12, 16]], [[4, 5]]);
    expect(day.slots).toHaveLength(48);
    expect(day.slots[23]).toBe('on');
    expect(day.slots[24]).toBe('off');
    expect(day.slots[31]).toBe('off');
    expect(day.slots[32]).toBe('on');
    expect(day.slots[8]).toBe('maybe');
  });

  it('lists contiguous off windows', () => {
    const day = scheduleFromOffRanges('2026-11-12', [
      [0, 4],
      [12, 16.5],
    ]);
    const windows = offWindows(day);
    expect(
      windows.map((w) => [
        new Date(w.start).getHours(),
        new Date(w.end).getHours(),
        new Date(w.end).getMinutes(),
      ]),
    ).toEqual([
      [0, 4, 0],
      [12, 16, 30],
    ]);
  });

  it('finds the next cut, or the one in progress', () => {
    const today = scheduleFromOffRanges('2026-11-12', [
      [0, 4],
      [12, 16],
    ]);
    const next = findNextCut([today, null], at(9, 14));
    expect(new Date(next!.start).getHours()).toBe(12);

    const during = findNextCut([today], at(13, 0));
    expect(new Date(during!.start).getHours()).toBe(12);

    expect(findNextCut([today], at(17, 0))).toBeNull();
  });

  it('merges a cut that runs over midnight', () => {
    const today = scheduleFromOffRanges('2026-11-12', [[22, 24]]);
    const tomorrow = scheduleFromOffRanges('2026-11-13', [[0, 2]]);
    const cut = findNextCut([today, tomorrow], at(21, 0));
    expect(new Date(cut!.start).getHours()).toBe(22);
    expect(new Date(cut!.end).getDate()).toBe(13);
    expect(new Date(cut!.end).getHours()).toBe(2);
  });

  it('reads the slot state for now, and unknown for another day', () => {
    const today = scheduleFromOffRanges(localDateKey(at(9)), [[12, 16]]);
    expect(slotStateAt(today, at(13))).toBe('off');
    expect(slotStateAt(today, at(9))).toBe('on');
    expect(slotStateAt(today, at(9, 0, 13))).toBe('unknown');
  });

  it('formats a countdown as h:mm', () => {
    expect(formatCountdown((2 * 60 + 46) * 60_000 + 30_000)).toBe('2:46');
    expect(formatCountdown(5 * 60_000)).toBe('0:05');
    expect(formatCountdown(-1)).toBe('0:00');
  });
});
