import { Controller, Get, Inject, Injectable, Module } from '@nestjs/common';
import { type AgendaItem, offWindows } from '@side-screen/shared';
import { SIDE_SCREEN_CONFIG } from '../config/config.module';
import type { SideScreenConfig } from '../config/config.schema';
import { mockToday } from '../mock/mock-schedule';
import {
  type ModuleData,
  SnapshotService,
  SnapshotSource,
} from '../snapshot/snapshot';
import { StreamService } from '../stream/stream.service';

/** DI token: Google Calendar (T1) + schedule cut windows (T2) + Reminders `Now` (K2). */
export abstract class TodaySource extends SnapshotSource<'today'> {}

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
    const cuts: AgendaItem[] = offWindows(mockToday(now)).map((w, i) => ({
      id: `cut-${i}`,
      start: w.start,
      end: w.end,
      title: 'Power cut · offline tasks',
      kind: 'cut',
    }));

    return {
      agenda: [...events, ...cuts].sort((a, b) =>
        a.start.localeCompare(b.start),
      ),
      focus: [
        { id: 'f1', title: 'Ghost replays', done: true },
        { id: 'f2', title: '2 LC mediums', done: false },
        { id: 'f3', title: 'Booking conflicts', done: false },
      ],
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
    return `calendar: ${events} events today, ${data.focus.filter((f) => !f.done).length} of ${data.focus.length} focus tasks open`;
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
  controllers: [TodayController],
  providers: [
    TodayService,
    { provide: TodaySource, useClass: MockTodaySource },
  ],
})
export class TodayModule {}
