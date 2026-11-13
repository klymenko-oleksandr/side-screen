import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type DaySchedule,
  localDateKey,
  offWindows,
  type SlotState,
} from '@side-screen/shared';
import { SIDE_SCREEN_CONFIG } from '../../config/config.module';
import type { SideScreenConfig } from '../../config/config.schema';
import { describeFetchError } from '../../dev/http';
import { Storage } from '../../storage/storage';
import { hashSlots } from '../dtek/dtek-parse';
import {
  MANUAL_REFRESH_COOLDOWN_MS,
  PowerSchedule,
  type RefreshResult,
  type ScheduleView,
} from '../schedule/power-schedule';
import {
  groupFromLookup,
  normalizeGroup,
  pickHouse,
  pickStreet,
  statusText,
  type YasnoAddressItem,
  yasnoDay,
  type YasnoResponse,
} from './yasno-parse';

const TIMEOUT_MS = 15_000;
const API = 'https://app.yasno.ua/api/blackout-service/public/shutdowns';

/**
 * The outage schedule from Yasno's public JSON API (the same data yasno.ua shows).
 * One small GET (~10 KB, every group in Kyiv) every `scheduleMinutes`, plus the ↻ button.
 * Each change to the group's schedule is stored in SQLite, so the day still shows offline.
 */
@Injectable()
export class YasnoService extends PowerSchedule {
  private readonly logger = new Logger(YasnoService.name);
  private data: YasnoResponse | null = null;
  private fetchedAt: number | null = null;
  private lastAttempt = 0;
  private lastManual = 0;
  private error: string | null = null;
  private inFlight: Promise<void> | null = null;

  private resolvedGroup: string | null = null;

  readonly configHint =
    'Set power.address (street, house) or power.group in config/side-screen.config.json';

  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
    private readonly storage: Storage,
  ) {
    super();
  }

  get configured(): boolean {
    const { group, address } = this.config.power;
    return Boolean(
      group.trim() || (address.street.trim() && address.house.trim()),
    );
  }

  /** From `power.group` if set, else looked up from `power.address` on the first fetch. */
  private get group(): string | null {
    const configured = this.config.power.group.trim();
    return configured ? normalizeGroup(configured) : this.resolvedGroup;
  }

  private get intervalMs(): number {
    return this.config.polling.scheduleMinutes * 60_000;
  }

  ensureFresh(now: Date): void {
    if (!this.configured || this.inFlight) return;
    if (now.getTime() - this.lastAttempt >= this.intervalMs)
      void this.fetch(now);
  }

  async refreshNow(now = new Date()): Promise<RefreshResult> {
    if (!this.configured)
      return { refreshed: false, message: this.configHint, retryInSec: 0 };
    const wait = this.lastManual + MANUAL_REFRESH_COOLDOWN_MS - now.getTime();
    if (wait > 0) {
      const retryInSec = Math.ceil(wait / 1000);
      return {
        refreshed: false,
        message: `Checked moments ago; try again in ${retryInSec} s`,
        retryInSec,
      };
    }
    this.lastManual = now.getTime();
    await (this.inFlight ?? this.fetch(now));
    return this.error
      ? { refreshed: false, message: `Yasno: ${this.error}`, retryInSec: 60 }
      : { refreshed: true, message: 'Schedule checked', retryInSec: 60 };
  }

  schedule(now: Date): ScheduleView {
    const today = localDateKey(now);
    const tomorrow = localDateKey(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
    );
    const entry = this.group ? this.data?.[this.group] : undefined;
    const base = {
      source: 'yasno' as const,
      group: this.group,
      fetchedAt: this.fetchedAt,
      publishedAt: entry?.updatedOn ?? null,
      nextFetchAt: this.configured ? this.lastAttempt + this.intervalMs : null,
      error: this.error,
    };

    if (entry) {
      const days = [yasnoDay(entry.today), yasnoDay(entry.tomorrow)];
      return {
        ...base,
        today: days.find((d) => d?.date === today) ?? this.stored(today),
        tomorrow: days.find((d) => d?.date === tomorrow) ?? null,
        status: statusText(entry.today?.status),
      };
    }
    // Not fetched yet, or offline: the last stored schedule.
    return {
      ...base,
      today: this.stored(today),
      tomorrow: this.stored(tomorrow),
      status: null,
    };
  }

  private stored(date: string): DaySchedule | null {
    if (!this.configured) return null;
    // Group not resolved yet (offline at boot): the last stored schedule of any group is ours.
    const snap = this.storage.latestSnapshot(date, this.group, 'fact');
    return snap ? { date, slots: snap.slots as SlotState[] } : null;
  }

  private fetch(now: Date): Promise<void> {
    this.lastAttempt = now.getTime();
    this.inFlight = this.doFetch(now).finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  private async doFetch(now: Date): Promise<void> {
    const { regionId, dsoId } = this.config.power.yasno;
    try {
      const group = this.group ?? (await this.lookupGroup());
      const data = await this.get<YasnoResponse>(
        `/regions/${regionId}/dsos/${dsoId}/planned-outages`,
      );
      if (!data[group]) {
        const known = Object.keys(data).slice(0, 6).join(', ');
        throw new Error(`group ${group} not in Yasno's list (e.g. ${known}…)`);
      }
      this.data = data;
      this.fetchedAt = now.getTime();
      if (this.error) this.logger.log('Yasno reachable again');
      this.error = null;
      this.store(now);
    } catch (err) {
      const message = describeFetchError(err);
      if (message !== this.error) this.logger.warn(`Yasno: ${message}`);
      this.error = message;
    }
  }

  /** Street → house → group, the same lookup yasno.ua does. Done once, then cached. */
  private async lookupGroup(): Promise<string> {
    const { regionId, dsoId } = this.config.power.yasno;
    const { street, house } = this.config.power.address;
    const streets = await this.get<YasnoAddressItem[]>(
      '/addresses/v2/streets',
      { regionId, dsoId, query: street.replace(/^вул\.?\s*/i, '') },
    );
    const s = pickStreet(streets, street);
    if (!s) throw new Error(`street "${street}" not found`);
    const houses = await this.get<YasnoAddressItem[]>('/addresses/v2/houses', {
      regionId,
      streetId: s.id,
      query: house.replace(/\D.*$/, ''),
      dsoId,
    });
    const h = pickHouse(houses, house);
    if (!h) throw new Error(`house "${house}" not found on ${s.value}`);
    const group = groupFromLookup(
      await this.get<unknown>('/addresses/v2/group', {
        regionId,
        streetId: s.id,
        houseId: h.id,
        dsoId,
      }),
    );
    if (!group) throw new Error(`no group for ${s.value}, ${h.value}`);
    this.resolvedGroup = group;
    this.logger.log(`Yasno: ${s.value}, ${h.value} is in group ${group}`);
    return group;
  }

  private async get<T>(
    path: string,
    query?: Record<string, string | number>,
  ): Promise<T> {
    const qs = query
      ? `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`
      : '';
    const res = await fetch(`${API}${path}${qs}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SideScreen/1.0 (personal dashboard)',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok)
      throw new Error(`${path.split('?')[0]} answered ${res.status}`);
    return (await res.json()) as T;
  }

  /** Saves today's and tomorrow's schedule when they changed, and logs the cut windows. */
  private store(now: Date): void {
    const group = this.group;
    const entry = group ? this.data?.[group] : undefined;
    if (!group || !entry) return;
    for (const day of [yasnoDay(entry.today), yasnoDay(entry.tomorrow)]) {
      if (!day) continue;
      const saved = this.storage.saveSnapshotIfChanged({
        fetchedAt: now.getTime(),
        dtekUpdate: entry.updatedOn ?? null,
        kind: 'fact',
        date: day.date,
        group,
        slots: day.slots,
        hash: hashSlots(day.slots),
      });
      if (saved) {
        const off = offWindows(day)
          .map((w) => `${hhmm(w.start)}–${hhmm(w.end)}`)
          .join(', ');
        this.logger.log(
          `schedule ${day.date} (group ${group}): ${off ? `off ${off}` : 'no cuts'}`,
        );
      }
    }
  }
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
