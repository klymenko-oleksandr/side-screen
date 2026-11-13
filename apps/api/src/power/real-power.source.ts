import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  findNextCut,
  type PowerSignal,
  type TimeWindow,
} from '@side-screen/shared';
import { SIDE_SCREEN_CONFIG } from '../config/config.module';
import type { SideScreenConfig } from '../config/config.schema';
import type { ModuleData } from '../snapshot/snapshot';
import { Storage } from '../storage/storage';
import {
  PowerAggregator,
  type SignalReading,
  type Verdict,
} from './aggregator/aggregator';
import { DtekService } from './dtek/dtek.service';
import { PowerSchedule, type ScheduleView } from './schedule/power-schedule';
import { MacSignals } from './mac/mac-signals';
import { offHoursInWindow, WEEK_MS } from './power-log';
import { PowerSource } from './power.source';
import {
  POWER_SIGNAL_PROVIDERS,
  type PowerSignalProvider,
} from './signals/signal-providers';

export interface PowerDebug {
  address: SideScreenConfig['power']['address'];
  group: string;
  schedule: Omit<ScheduleView, 'today' | 'tomorrow'> & {
    today: undefined;
    tomorrow: undefined;
    hasToday: boolean;
    hasTomorrow: boolean;
  };
  dtekLive: unknown;
  readings: SignalReading[];
  verdict: Omit<Verdict, 'counted'> & { counted: string[] };
  battery: unknown;
  internet: unknown;
}

/**
 * Real Power module data (phase 2): signal providers → aggregator → status, plus the outage
 * schedule (Yasno by default), the Mac's battery and ping, and the 7-day off total from the SQLite event log.
 */
@Injectable()
export class RealPowerSource extends PowerSource {
  readonly label = 'power sources';
  readonly mock = false;
  private readonly logger = new Logger('PowerAggregator');
  private readonly aggregator: PowerAggregator;
  private last: PowerDebug | null = null;

  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
    @Inject(POWER_SIGNAL_PROVIDERS)
    private readonly providers: PowerSignalProvider[],
    private readonly dtek: DtekService,
    private readonly schedule: PowerSchedule,
    private readonly mac: MacSignals,
    private readonly storage: Storage,
  ) {
    super();
    const p = config.power;
    this.aggregator = new PowerAggregator({
      threshold: p.threshold,
      holdMs: p.holdSeconds * 1000,
      freshMs: p.freshMinutes * 60_000,
    });
    const last = storage.lastPowerEvent();
    if (last) this.aggregator.restore(last.status, last.at);
  }

  async fetch(now: Date): Promise<ModuleData<'power'>> {
    this.schedule.ensureFresh(now);
    const dtekLive = this.config.power.dtekLive;
    if (dtekLive && this.schedule !== this.dtek) this.dtek.ensureFresh(now);
    const battery = await this.mac.battery();
    const internet = this.mac.internet(now);
    const readings = this.providers.map((p) => p.read({ now, battery }));
    const verdict = this.aggregator.update(readings, now.getTime());

    if (verdict.changed) {
      this.storage.recordPowerEvent(verdict.status, verdict.since);
      const votes = readings.map((r) => `${r.source} ${r.state}`).join(', ');
      this.logger.log(
        `grid ${verdict.status} (score ${verdict.score}: ${votes})`,
      );
    }

    const view = this.schedule.schedule(now);
    const dtekView = dtekLive ? this.dtek.view(now) : null;
    const outage = this.liveOutage(now, dtekView?.house ?? null);
    const nextCut: TimeWindow | null = outage
      ? { start: outage.start, end: outage.end }
      : findNextCut([view.today, view.tomorrow], now);
    const signals: PowerSignal[] = readings.map((r) => ({
      source: r.source,
      label: r.label,
      state: r.state,
      observedAt: new Date(r.observedAt || now.getTime()).toISOString(),
      detail: r.detail,
      weight: verdict.counted.has(r.source) ? r.weight : 0,
    }));

    this.last = {
      address: this.config.power.address,
      group: this.config.power.group,
      schedule: {
        ...view,
        today: undefined,
        tomorrow: undefined,
        hasToday: Boolean(view.today),
        hasTomorrow: Boolean(view.tomorrow),
      },
      dtekLive: dtekView
        ? {
            street: dtekView.street,
            house: dtekView.house,
            liveAt: dtekView.liveAt,
            error: dtekView.error,
          }
        : 'off',
      readings,
      verdict: { ...verdict, counted: [...verdict.counted] },
      battery,
      internet,
    };

    return {
      status: verdict.status,
      since: new Date(verdict.since).toISOString(),
      group: view.group ?? '—',
      signals,
      nextCut,
      today: view.today ?? {
        date: '',
        slots: Array.from({ length: 48 }, () => 'unknown'),
      },
      tomorrow: view.tomorrow,
      device: {
        batteryPct: battery?.pct ?? null,
        onAc: battery?.onAc ?? false,
        internet: {
          online: internet?.online ?? false,
          latencyMs: internet?.latencyMs ?? null,
        },
      },
      weekOffHours: offHoursInWindow(
        this.storage.powerEventsSince(now.getTime() - WEEK_MS),
        now.getTime(),
      ),
      outage,
      score: verdict.score,
      notice: this.notice(view, dtekView?.error ?? null),
      schedule: {
        source: view.source,
        fetchedAt: view.fetchedAt
          ? new Date(view.fetchedAt).toISOString()
          : null,
        publishedAt: view.publishedAt,
        nextFetchAt: view.nextFetchAt
          ? new Date(view.nextFetchAt).toISOString()
          : null,
      },
    };
  }

  debug(): PowerDebug | null {
    return this.last;
  }

  private liveOutage(
    now: Date,
    house: ReturnType<DtekService['view']>['house'] | null,
  ) {
    if (!house?.start || !house.end) return null;
    const t = now.getTime();
    if (house.start.getTime() > t || house.end.getTime() < t) return null;
    return {
      reason: house.reason,
      start: house.start.toISOString(),
      end: house.end.toISOString(),
    };
  }

  private notice(
    view: ScheduleView,
    dtekLiveError: string | null,
  ): string | null {
    if (!this.schedule.configured) return this.schedule.configHint;
    if (view.error)
      return `${view.source === 'yasno' ? 'Yasno' : 'DTEK'}: ${view.error}`;
    if (view.status) return view.status;
    if (dtekLiveError) return `DTEK live status: ${dtekLiveError}`;
    return null;
  }
}
