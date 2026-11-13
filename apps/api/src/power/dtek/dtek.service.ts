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
import {
  MANUAL_REFRESH_COOLDOWN_MS,
  PowerSchedule,
  type RefreshResult,
  type ScheduleView,
} from '../schedule/power-schedule';
import {
  type DtekHouse,
  type DtekPage,
  factDay,
  groupLabel,
  hashSlots,
  homeNumBody,
  mergeDay,
  parseHouse,
  parsePage,
  presetDay,
  streetCandidates,
} from './dtek-parse';

const USER_AGENT =
  'SideScreen/1.0 (personal dashboard; +https://github.com/klymenko-oleksandr/side-screen)';
const TIMEOUT_MS = 15_000;

export interface DtekView {
  /** Display label, e.g. `38.1`. */
  group: string | null;
  today: DaySchedule | null;
  tomorrow: DaySchedule | null;
  house: DtekHouse | null;
  /** ms epoch of the last good page load / live lookup. */
  pageAt: number | null;
  liveAt: number | null;
  street: string | null;
  /** DTEK's own "updated" stamp for the schedule. */
  dtekUpdate: string | null;
  error: string | null;
}

/**
 * Talks to the DTEK Kyiv Grids shutdowns page for the configured address.
 *
 * - The page (schedule + weekly plan) reloads every `dtekScheduleHours`; the live status for
 *   the house every `dtekLiveMinutes`. Both run in the background, never blocking the power tick.
 * - Every change to the group's schedule is stored in SQLite; when DTEK can't be reached the
 *   last stored schedule is used, so a power cut with no internet still shows the day (PRD N3).
 * - Requests identify themselves honestly and stay infrequent. If DTEK answers with its
 *   bot-protection page, the error is reported and the other power signals carry on.
 */
@Injectable()
export class DtekService extends PowerSchedule {
  readonly configHint =
    'Set power.address (street and house) in config/side-screen.config.json';
  private lastManual = 0;
  private readonly logger = new Logger(DtekService.name);
  private cookies = new Map<string, string>();
  private page: DtekPage | null = null;
  private house: DtekHouse | null = null;
  private street: string | null = null;
  private pageAt: number | null = null;
  private liveAt: number | null = null;
  private lastAttempt = { page: 0, live: 0 };
  private error: string | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
    private readonly storage: Storage,
  ) {
    super();
  }

  get configured(): boolean {
    const { street, house } = this.config.power.address;
    return Boolean(street.trim() && house.trim());
  }

  /** Starts a background refresh when one is due. Never throws, never waits. */
  ensureFresh(now: Date): void {
    if (!this.configured || this.inFlight) return;
    const t = now.getTime();
    const pageDue =
      t - this.lastAttempt.page >=
      this.config.polling.dtekScheduleHours * 3_600_000;
    const liveDue =
      t - this.lastAttempt.live >= this.config.polling.dtekLiveMinutes * 60_000;
    if (pageDue || liveDue) void this.refresh(now, pageDue);
  }

  /** Reloads page and live status now (manual refresh button), at most once a minute. */
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
    await (this.inFlight ?? this.refresh(now, true));
    return this.error
      ? { refreshed: false, message: `DTEK: ${this.error}`, retryInSec: 60 }
      : { refreshed: true, message: 'Schedule checked', retryInSec: 60 };
  }

  schedule(now: Date): ScheduleView {
    const v = this.view(now);
    return {
      source: 'dtek',
      group: v.group,
      today: v.today,
      tomorrow: v.tomorrow,
      fetchedAt: v.pageAt,
      publishedAt: null,
      nextFetchAt: this.lastAttempt.page
        ? this.lastAttempt.page +
          this.config.polling.dtekScheduleHours * 3_600_000
        : null,
      status: null,
      error: v.error,
    };
  }

  view(now: Date): DtekView {
    const today = localDateKey(now);
    const tomorrowDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const tomorrow = localDateKey(tomorrowDate);
    const groupKey = this.house?.groupKey ?? null;

    let todaySchedule: DaySchedule | null = null;
    let tomorrowSchedule: DaySchedule | null = null;
    let group = groupKey;

    if (this.page && groupKey) {
      todaySchedule = mergeDay(
        today,
        factDay(this.page.fact, groupKey, today),
        presetDay(this.page.preset, groupKey, today),
      );
      const tomorrowFact = factDay(this.page.fact, groupKey, tomorrow);
      tomorrowSchedule = tomorrowFact
        ? mergeDay(
            tomorrow,
            tomorrowFact,
            presetDay(this.page.preset, groupKey, tomorrow),
          )
        : null;
    } else {
      // Offline or DTEK blocked: fall back to the last stored schedule.
      const fact = this.storage.latestSnapshot(today, groupKey, 'fact');
      const preset = this.storage.latestSnapshot(today, groupKey, 'preset');
      const stored = fact ?? preset;
      if (stored) {
        group ??= stored.group;
        todaySchedule = mergeDay(
          today,
          (fact?.slots as SlotState[]) ?? null,
          (preset?.slots as SlotState[]) ?? null,
        );
        const nextFact = this.storage.latestSnapshot(
          tomorrow,
          stored.group,
          'fact',
        );
        tomorrowSchedule = nextFact
          ? { date: tomorrow, slots: nextFact.slots as SlotState[] }
          : null;
      }
    }

    return {
      group: group ? groupLabel(group) : null,
      today: todaySchedule,
      tomorrow: tomorrowSchedule,
      house: this.house,
      pageAt: this.pageAt,
      liveAt: this.liveAt,
      street: this.street,
      dtekUpdate: this.page?.fact?.update ?? null,
      error: this.error,
    };
  }

  private refresh(now: Date, reloadPage: boolean): Promise<void> {
    this.inFlight = this.doRefresh(now, reloadPage).finally(
      () => (this.inFlight = null),
    );
    return this.inFlight;
  }

  private async doRefresh(now: Date, reloadPage: boolean): Promise<void> {
    const t = now.getTime();
    try {
      if (reloadPage || !this.page) {
        this.lastAttempt.page = t;
        await this.loadPage(now);
      }
      this.lastAttempt.live = t;
      await this.loadHouse(now);
      if (this.error) this.logger.log('DTEK reachable again');
      this.error = null;
    } catch (err) {
      const message = describeFetchError(err);
      if (message !== this.error) this.logger.warn(`DTEK: ${message}`);
      this.error = message;
      // A broken session is the usual cause; start a fresh one next time.
      this.page = null;
      this.cookies.clear();
    }
  }

  private async loadPage(now: Date): Promise<void> {
    const res = await this.request('/ua/shutdowns', { method: 'GET' });
    const html = await res.text();
    this.page = parsePage(html);
    this.pageAt = now.getTime();
    if (!this.page.fact && !this.page.preset) {
      throw new Error(
        'schedule not found in the page (the page layout may have changed)',
      );
    }
    this.storeSnapshots(now);
  }

  private async loadHouse(now: Date): Promise<void> {
    const page = this.page;
    if (!page) return;
    const { street, house } = this.config.power.address;
    const candidates = this.street
      ? [this.street]
      : streetCandidates(street, page.streets);

    for (const candidate of candidates) {
      const res = await this.request('/ua/ajax', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          ...(page.csrf ? { 'X-CSRF-Token': page.csrf } : {}),
        },
        body: homeNumBody(candidate, page.fact?.update).toString(),
      });
      const found = parseHouse(await res.json().catch(() => null), house);
      if (found) {
        const groupChanged = found.groupKey !== this.house?.groupKey;
        if (!this.street)
          this.logger.log(`DTEK address: ${candidate}, ${house}`);
        this.street = candidate;
        this.house = found;
        this.liveAt = now.getTime();
        if (groupChanged && found.groupKey) {
          this.logger.log(`DTEK group ${groupLabel(found.groupKey)}`);
          this.storeSnapshots(now);
        }
        return;
      }
    }
    throw new Error(
      `house "${house}" not found on "${street}" (tried: ${candidates.join(' / ')})`,
    );
  }

  /** Saves today's and tomorrow's schedule when they changed, and logs what changed. */
  private storeSnapshots(now: Date): void {
    const groupKey = this.house?.groupKey;
    if (!this.page || !groupKey) return;
    const dates = [
      localDateKey(now),
      localDateKey(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
      ),
    ];
    for (const date of dates) {
      for (const kind of ['fact', 'preset'] as const) {
        const slots =
          kind === 'fact'
            ? factDay(this.page.fact, groupKey, date)
            : presetDay(this.page.preset, groupKey, date);
        if (!slots) continue;
        const saved = this.storage.saveSnapshotIfChanged({
          fetchedAt: now.getTime(),
          dtekUpdate: this.page.fact?.update ?? null,
          kind,
          date,
          group: groupKey,
          slots,
          hash: hashSlots(slots),
        });
        if (saved && kind === 'fact') {
          const off = offWindows({ date, slots })
            .map((w) => `${hhmm(w.start)}–${hhmm(w.end)}`)
            .join(', ');
          this.logger.log(
            `schedule ${date} (group ${groupLabel(groupKey)}): ${off ? `off ${off}` : 'no cuts'}`,
          );
        }
      }
    }
  }

  private async request(
    path: string,
    init: RequestInit & { headers?: Record<string, string> },
  ): Promise<Response> {
    const base = this.config.power.dtekBaseUrl.replace(/\/$/, '');
    const res = await fetch(base + path, {
      ...init,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'uk,en;q=0.8',
        Referer: `${base}/ua/shutdowns`,
        ...(this.cookies.size
          ? {
              Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
            }
          : {}),
        ...init.headers,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0)
        this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    if (!res.ok)
      throw new Error(`${init.method ?? 'GET'} ${path} answered ${res.status}`);
    return res;
  }
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
