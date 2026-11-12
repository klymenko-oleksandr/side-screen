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
}

export type TodaySnapshot = WithMeta<TodayData>;
