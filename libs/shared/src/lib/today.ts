import type { WithMeta } from './module-meta';

export type AgendaKind = 'event' | 'cut';

export interface AgendaItem {
  id: string;
  /** ISO timestamp. */
  start: string;
  /** ISO timestamp. */
  end: string;
  title: string;
  kind: AgendaKind;
  allDay?: boolean;
}

export interface FocusTask {
  id: string;
  title: string;
  done: boolean;
}

export interface TodayData {
  /** Calendar events plus scheduled cut windows, in time order (PRD T1, T2). */
  agenda: AgendaItem[];
  /** "Three things" from the Reminders `Now` list (PRD K2; mock until phase 5). */
  focus: FocusTask[];
  /** `mock` until the Reminders helper exists (phase 5); the UI marks it as work in progress. */
  focusSource: 'mock' | 'reminders';
  /** Why the calendar is missing or partial, e.g. "Add GOOGLE_CALENDAR_ICS_URL to .env". */
  notice: string | null;
}

export type TodaySnapshot = WithMeta<TodayData>;
