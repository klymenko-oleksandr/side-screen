import type { DaySchedule } from '@side-screen/shared';

export type ScheduleSourceName = 'yasno' | 'dtek';

/** The outage schedule for the configured group, as every consumer sees it. */
export interface ScheduleView {
  source: ScheduleSourceName;
  /** Display label of the group, e.g. `38.1`. */
  group: string | null;
  today: DaySchedule | null;
  /** Present once the operator publishes tomorrow. */
  tomorrow: DaySchedule | null;
  /** ms epoch of the last successful fetch. */
  fetchedAt: number | null;
  /** When the operator last changed the schedule (ISO), if it says. */
  publishedAt: string | null;
  /** ms epoch of the next automatic fetch. */
  nextFetchAt: number | null;
  /** Operator's state worth showing, e.g. "Emergency shutdowns: schedule not in effect". */
  status: string | null;
  error: string | null;
}

export interface RefreshResult {
  refreshed: boolean;
  message: string;
  /** Seconds until a manual refresh is allowed again. */
  retryInSec: number;
}

/**
 * DI token for "where the schedule comes from" (Yasno by default, DTEK page optionally).
 * The schedule signal, the Today card's cut windows and the Power card all read through it.
 */
export abstract class PowerSchedule {
  abstract readonly configured: boolean;
  /** What to set when not configured. */
  abstract readonly configHint: string;
  /** Starts a background fetch when one is due. Never waits, never throws. */
  abstract ensureFresh(now: Date): void;
  /** Manual refresh (the ↻ button), rate-limited. */
  abstract refreshNow(now?: Date): Promise<RefreshResult>;
  abstract schedule(now: Date): ScheduleView;
}

/** Manual refreshes closer together than this are answered from cache. */
export const MANUAL_REFRESH_COOLDOWN_MS = 60_000;
