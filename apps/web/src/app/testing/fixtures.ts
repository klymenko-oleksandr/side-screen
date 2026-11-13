import { type PowerSnapshot, scheduleFromOffRanges } from '@side-screen/shared';

/** A local-time Date on 12 Nov 2026. The tests format with the machine's zone, so pin it to Kyiv. */
export const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m);

export function powerSnapshot(
  overrides: Partial<PowerSnapshot> = {},
): PowerSnapshot {
  return {
    status: 'ON',
    since: at(5, 2).toISOString(),
    group: '38.1',
    signals: [],
    nextCut: { start: at(12).toISOString(), end: at(16).toISOString() },
    today: scheduleFromOffRanges('2026-11-12', [
      [0, 4],
      [12, 16],
    ]),
    tomorrow: null,
    device: {
      batteryPct: 100,
      onAc: true,
      internet: { online: true, latencyMs: 18 },
    },
    weekOffHours: 41,
    outage: null,
    score: 4,
    notice: null,
    schedule: {
      source: 'yasno',
      fetchedAt: at(10, 44).toISOString(),
      publishedAt: at(9, 45).toISOString(),
      nextFetchAt: at(11, 14).toISOString(),
    },
    meta: { updatedAt: at(9, 14).toISOString(), stale: false, mock: true },
    ...overrides,
  };
}
