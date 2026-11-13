import { Controller, Get, Inject, Injectable, Module } from '@nestjs/common';
import {
  type AgendaItem,
  type DaySchedule,
  type FocusTask,
  offWindows,
} from '@side-screen/shared';
import { SIDE_SCREEN_CONFIG } from '../config/config.module';
import type { SideScreenConfig } from '../config/config.schema';
import { secret } from '../config/env';
import { describeFetchError } from '../dev/http';
import { mockToday } from '../mock/mock-schedule';
import { PowerSchedule } from '../power/schedule/power-schedule';
import { PowerModule } from '../power/power.module';
import {
  type ModuleData,
  SnapshotService,
  SnapshotSource,
} from '../snapshot/snapshot';
import { StreamService } from '../stream/stream.service';
import { agendaFromIcs } from './ics';

/** DI token: Google Calendar (T1) + schedule cut windows (T2) + Reminders `Now` (K2). */
export abstract class TodaySource extends SnapshotSource<'today'> {}

/** Placeholder until the Reminders helper (phase 5); the UI marks it as work in progress. */
const MOCK_FOCUS: FocusTask[] = [
  { id: 'f1', title: 'Ghost replays', done: true },
  { id: 'f2', title: '2 LC mediums', done: false },
  { id: 'f3', title: 'Booking conflicts', done: false },
];

/** Scheduled cut windows as agenda rows (PRD T2). */
function cutItems(day: DaySchedule | null): AgendaItem[] {
  if (!day) return [];
  return offWindows(day).map((w, i) => ({
    id: `cut-${day.date}-${i}`,
    start: w.start,
    end: w.end,
    title: 'Power cut · offline tasks',
    kind: 'cut',
  }));
}

const byStart = (a: AgendaItem, b: AgendaItem) =>
  a.start.localeCompare(b.start);

@Injectable()
export class MockTodaySource extends TodaySource {
  readonly label = 'mock calendar';
  readonly mock = true;

  async fetch(now: Date): Promise<ModuleData<'today'>> {
    const at = (h: number, m = 0) =>
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        h,
        m,
      ).toISOString();
    const events: AgendaItem[] = [
      {
        id: 'e1',
        start: at(9, 30),
        end: at(11, 0),
        title: 'Deep work — system design',
        kind: 'event',
      },
      {
        id: 'e2',
        start: at(17, 0),
        end: at(18, 0),
        title: 'Lemon.io interview',
        kind: 'event',
      },
      {
        id: 'e3',
        start: at(20, 0),
        end: at(21, 30),
        title: 'Football · leave 19:15',
        kind: 'event',
      },
    ];
    return {
      agenda: [...events, ...cutItems(mockToday(now))].sort(byStart),
      focus: MOCK_FOCUS,
      focusSource: 'mock',
      notice: null,
    };
  }
}

const CALENDAR_TIMEOUT_MS = 15_000;

/** Google Calendar through its secret iCal address (`GOOGLE_CALENDAR_ICS_URL` in .env) + DTEK cut windows. */
@Injectable()
export class IcsTodaySource extends TodaySource {
  readonly label = 'calendar';
  readonly mock = false;
  private loadedOnce = false;

  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
    private readonly schedule: PowerSchedule,
  ) {
    super();
  }

  async fetch(now: Date): Promise<ModuleData<'today'>> {
    const cuts = cutItems(this.schedule.schedule(now).today);
    const base = { focus: MOCK_FOCUS, focusSource: 'mock' as const };
    const url = secret('GOOGLE_CALENDAR_ICS_URL');
    if (!url) {
      return {
        ...base,
        agenda: cuts,
        notice: 'Add GOOGLE_CALENDAR_ICS_URL to .env to show your calendar',
      };
    }

    let events: AgendaItem[];
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(CALENDAR_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`calendar answered ${res.status}`);
      events = agendaFromIcs(await res.text(), now, {
        hideAllDay: this.config.calendar.hideAllDay,
      });
    } catch (err) {
      // After a first success, let the service keep the last agenda, marked stale (PRD S2).
      if (this.loadedOnce) throw err;
      return {
        ...base,
        agenda: cuts,
        notice: `Calendar unavailable: ${describeFetchError(err)}`,
      };
    }
    this.loadedOnce = true;
    return {
      ...base,
      agenda: [...events, ...cuts].sort(byStart),
      notice: null,
    };
  }
}

@Injectable()
export class TodayService extends SnapshotService<'today'> {
  protected readonly module = 'today';
  protected readonly intervalMs: number;

  constructor(
    source: TodaySource,
    stream: StreamService,
    @Inject(SIDE_SCREEN_CONFIG) config: SideScreenConfig,
  ) {
    super(source, stream);
    this.intervalMs = config.polling.calendarMinutes * 60_000;
  }

  protected override summarize(data: ModuleData<'today'>): string {
    const events = data.agenda.filter((a) => a.kind === 'event').length;
    const cuts = data.agenda.length - events;
    return `calendar: ${events} events, ${cuts} cut windows today${data.notice ? ` (${data.notice})` : ''}`;
  }
}

@Controller('today')
export class TodayController {
  constructor(private readonly today: TodayService) {}

  @Get()
  get() {
    return this.today.snapshot();
  }
}

@Module({
  imports: [PowerModule],
  controllers: [TodayController],
  providers: [
    TodayService,
    MockTodaySource,
    IcsTodaySource,
    {
      provide: TodaySource,
      useFactory: (
        config: SideScreenConfig,
        real: IcsTodaySource,
        mock: MockTodaySource,
      ) => (config.mock ? mock : real),
      inject: [SIDE_SCREEN_CONFIG, IcsTodaySource, MockTodaySource],
    },
  ],
})
export class TodayModule {}
