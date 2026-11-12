import type { DevSnapshot } from './dev';
import type { FooterSnapshot, HeaderSnapshot } from './header';
import type { LogLine } from './logs';
import type { PowerSnapshot } from './power';
import type { TodaySnapshot } from './today';

/** Snapshot-type events replace the module's state wholesale. */
export interface SnapshotEvents {
  header: HeaderSnapshot;
  power: PowerSnapshot;
  today: TodaySnapshot;
  dev: DevSnapshot;
  footer: FooterSnapshot;
}

export type ModuleName = keyof SnapshotEvents;

export const MODULE_NAMES: readonly ModuleName[] = [
  'header',
  'power',
  'today',
  'dev',
  'footer',
] as const;

/**
 * Everything the server pushes over `GET /api/stream` (Server-Sent Events).
 * The SSE `event:` field is the `type`; `data:` is the JSON payload.
 */
export type DashboardEvent =
  | { [K in ModuleName]: { type: K; data: SnapshotEvents[K] } }[ModuleName]
  | { type: 'log'; data: LogLine }
  | { type: 'log-backlog'; data: LogLine[] };

export type DashboardEventType = DashboardEvent['type'];

export const STREAM_PATH = '/api/stream';
