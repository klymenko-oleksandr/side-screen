import { offHoursInWindow } from './power-log';

const H = 3_600_000;
const NOW = 1_800_000_000_000;

describe('offHoursInWindow', () => {
  it('sums OFF intervals, counting the current one up to now', () => {
    const events = [
      { at: NOW - 30 * H, status: 'OFF' as const },
      { at: NOW - 26 * H, status: 'ON' as const },
      { at: NOW - 2 * H, status: 'OFF' as const },
    ];
    expect(offHoursInWindow(events, NOW)).toBe(6);
  });

  it('clips an outage that started before the 7-day window', () => {
    const events = [
      { at: NOW - 8 * 24 * H, status: 'OFF' as const },
      { at: NOW - 7 * 24 * H + 3 * H, status: 'ON' as const },
    ];
    expect(offHoursInWindow(events, NOW)).toBe(3);
  });

  it('does not count UNCONFIRMED', () => {
    expect(
      offHoursInWindow([{ at: NOW - 5 * H, status: 'UNCONFIRMED' }], NOW),
    ).toBe(0);
  });
});
