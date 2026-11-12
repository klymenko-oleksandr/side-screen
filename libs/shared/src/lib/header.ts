import type { WithMeta } from './module-meta';

export interface WeatherNow {
  tempC: number;
  summary: string;
}

export interface HeaderData {
  city: string;
  /** Null until a weather API is picked (PRD open question). */
  weather: WeatherNow | null;
}

export type HeaderSnapshot = WithMeta<HeaderData>;

export interface FooterData {
  /** English word of the hour (PRD F1). */
  word: { term: string; hint: string } | null;
  /** LeetCode streak in days (PRD F2, later). */
  leetcodeStreakDays: number | null;
}

export type FooterSnapshot = WithMeta<FooterData>;

/** Non-secret settings the UI needs. Served by `GET /api/ui-config`. */
export interface UiConfig {
  timezone: string;
  /** Footer is hidden in phase 1 so the Reminders widgets fit below the window. */
  showFooter: boolean;
  /** How many log lines the tail shows. */
  logLines: number;
}
