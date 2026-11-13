import { Inject, Injectable } from '@nestjs/common';
import { slotStateAt } from '@side-screen/shared';
import { SIDE_SCREEN_CONFIG } from '../../config/config.module';
import type { SideScreenConfig } from '../../config/config.schema';
import type { SignalReading } from '../aggregator/aggregator';
import { DtekService } from '../dtek/dtek.service';
import { PowerSchedule } from '../schedule/power-schedule';
import type { BatteryReading } from '../mac/mac-signals';

/** What every provider sees on a power tick. */
export interface SignalContext {
  now: Date;
  battery: BatteryReading | null;
}

/**
 * One source of power evidence (PRD P1a). Adding a source = one class implementing this,
 * listed in `POWER_SIGNAL_PROVIDERS`; the aggregator and UI stay as they are.
 */
export interface PowerSignalProvider {
  readonly id: string;
  read(ctx: SignalContext): SignalReading;
}

export const POWER_SIGNAL_PROVIDERS = Symbol('POWER_SIGNAL_PROVIDERS');

/** MacBook charger: strong-ish when on AC, weak on battery (the laptop moves to the sofa). */
@Injectable()
export class ChargerSignal implements PowerSignalProvider {
  readonly id = 'charger';
  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
  ) {}

  read({ now, battery }: SignalContext): SignalReading {
    const w = this.config.power.weights;
    const base = {
      source: this.id,
      label: 'MacBook charger',
      observedAt: now.getTime(),
    };
    if (!battery)
      return {
        ...base,
        state: 'unknown',
        weight: 0,
        detail: 'pmset unavailable',
      };
    return battery.onAc
      ? { ...base, state: 'on', weight: w.chargerAc, detail: 'on AC' }
      : {
          ...base,
          state: 'off',
          weight: w.chargerBattery,
          detail: 'on battery',
        };
  }
}

/** The outage schedule (Yasno or DTEK): what is expected for this half-hour. `maybe` slots don't vote. */
@Injectable()
export class ScheduleSignal implements PowerSignalProvider {
  readonly id = 'schedule';
  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
    private readonly schedule: PowerSchedule,
  ) {}

  read({ now }: SignalContext): SignalReading {
    const view = this.schedule.schedule(now);
    const base = {
      source: this.id,
      label: view.source === 'yasno' ? 'Yasno schedule' : 'DTEK schedule',
      observedAt: now.getTime(),
      alwaysFresh: true,
    };
    const slot = slotStateAt(view.today, now);
    if (slot === 'on' || slot === 'off') {
      return {
        ...base,
        state: slot,
        weight: this.config.power.weights.dtekSchedule,
        detail: `slot ${slot}`,
      };
    }
    return {
      ...base,
      state: 'unknown',
      weight: 0,
      detail: slot === 'maybe' ? 'possible cut' : 'no schedule',
    };
  }
}

/** DTEK live status for the house: what DTEK reports right now. */
@Injectable()
export class DtekLiveSignal implements PowerSignalProvider {
  readonly id = 'dtek-live';
  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
    private readonly dtek: DtekService,
  ) {}

  read({ now }: SignalContext): SignalReading {
    const w = this.config.power.weights;
    if (!this.config.power.dtekLive) {
      return {
        source: this.id,
        label: 'DTEK live status',
        observedAt: 0,
        state: 'unknown',
        weight: 0,
        detail: 'off (power.dtekLive)',
      };
    }
    const view = this.dtek.view(now);
    const base = {
      source: this.id,
      label: 'DTEK live status',
      observedAt: view.liveAt ?? 0,
    };
    const house = view.house;
    if (!house || view.liveAt === null)
      return {
        ...base,
        state: 'unknown',
        weight: 0,
        detail: view.error ?? 'no data yet',
      };

    const t = now.getTime();
    const started = house.start && house.start.getTime() <= t;
    if (!house.start || !started)
      return {
        ...base,
        state: 'on',
        weight: w.dtekLiveClear,
        detail: 'no outage listed',
      };
    if (house.end && house.end.getTime() < t)
      return {
        ...base,
        state: 'unknown',
        weight: 0,
        detail: 'outage end time has passed',
      };
    return {
      ...base,
      state: 'off',
      weight: w.dtekLiveOutage,
      detail: house.reason || 'outage listed',
    };
  }
}
