import { Injectable } from '@nestjs/common';
import {
  findNextCut,
  type PowerSignal,
  slotStateAt,
} from '@side-screen/shared';
import {
  MOCK_GROUP,
  mockToday,
  mockTomorrow,
  runStart,
} from '../mock/mock-schedule';
import type { ModuleData } from '../snapshot/snapshot';
import { PowerSource } from './power.source';

const BATTERY_DRAIN_PER_MIN = 0.15;

/** Time-driven mock: the status, countdown and strip follow the clock, like the real thing will. */
@Injectable()
export class MockPowerSource extends PowerSource {
  readonly label = 'mock power';
  readonly mock = true;

  async fetch(now: Date): Promise<ModuleData<'power'>> {
    const today = mockToday(now);
    const tomorrow = mockTomorrow(now);
    const scheduled = slotStateAt(today, now);
    const isOff = scheduled === 'off';
    const since = runStart(today, now);
    const nextCut = findNextCut([today, tomorrow], now);
    const observedAt = now.toISOString();
    const minutesOff = isOff ? (now.getTime() - since.getTime()) / 60_000 : 0;

    const signals: PowerSignal[] = [
      {
        source: 'dtek-schedule',
        label: 'DTEK schedule',
        state: isOff ? 'off' : 'on',
        observedAt,
      },
      {
        source: 'dtek-live',
        label: 'DTEK live status',
        state: isOff ? 'off' : 'on',
        observedAt,
        detail:
          isOff && nextCut
            ? `planned outage until ${hhmm(new Date(nextCut.end))}`
            : 'no outage listed',
      },
      {
        source: 'charger',
        label: 'MacBook charger',
        state: isOff ? 'off' : 'on',
        observedAt,
        detail: isOff ? 'on battery' : 'on AC',
      },
    ];

    return {
      status: isOff ? 'OFF' : 'ON',
      since: since.toISOString(),
      group: MOCK_GROUP,
      signals,
      nextCut,
      today,
      tomorrow,
      device: {
        batteryPct: Math.max(
          20,
          Math.round(100 - minutesOff * BATTERY_DRAIN_PER_MIN),
        ),
        onAc: !isOff,
        internet: {
          online: true,
          latencyMs: 14 + Math.round(Math.random() * 12),
        },
      },
      weekOffHours: 41,
      outage:
        isOff && nextCut
          ? {
              reason: 'Планове відключення (mock)',
              start: nextCut.start,
              end: nextCut.end,
            }
          : null,
      score: isOff ? -5 : 4,
      notice: null,
    };
  }
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
