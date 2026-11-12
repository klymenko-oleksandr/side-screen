import { createHash } from 'node:crypto';
import {
  type DaySchedule,
  localDateKey,
  SLOTS_PER_DAY,
  type SlotState,
} from '@side-screen/shared';

/**
 * Parsing for the DTEK Kyiv Grids shutdowns page (dtek-kem.com.ua/ua/shutdowns), following
 * the structure recorded in the PRD (checked against the live page on 2026-11-12):
 *
 * - the page script assigns `DisconSchedule.fact` (actual schedule) and `DisconSchedule.preset`
 *   (weekly plan) as JSON object literals;
 * - `POST /ua/ajax` with `method=getHomeNum` returns every house on a street with its live status.
 *
 * Everything here is pure, so it can be tested without the network.
 */

export interface DtekFact {
  data: Record<string, Record<string, Record<string, string>>>;
  update?: string;
  today?: number;
}

export interface DtekPreset {
  data: Record<string, Record<string, Record<string, string>>>;
}

export interface DtekPage {
  csrf: string | null;
  fact: DtekFact | null;
  preset: DtekPreset | null;
  /** Street names, if the page lists them. Used to match the configured street. */
  streets: string[] | null;
}

export interface DtekHouse {
  /** e.g. `GPV38.1` */
  groupKey: string | null;
  reason: string;
  start: Date | null;
  end: Date | null;
}

export class DtekBlockedError extends Error {
  constructor() {
    super('DTEK returned a bot-protection page instead of the schedule');
  }
}

/** Reads a JS assignment such as `DisconSchedule.fact = {...}` and parses its JSON value. */
export function extractAssignment<T>(source: string, name: string): T | null {
  const at = source.search(
    new RegExp(`${name.replace(/\./g, '\\.')}\\s*=\\s*[[{]`),
  );
  if (at < 0) return null;
  const start = source.slice(at).search(/[[{]/) + at;
  const end = matchingBracket(source, start);
  if (end < 0) return null;
  try {
    return JSON.parse(source.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** Index of the bracket closing the one at `start`, skipping brackets inside strings. */
function matchingBracket(source: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function parsePage(html: string): DtekPage {
  const fact = extractAssignment<DtekFact>(html, 'DisconSchedule.fact');
  const preset = extractAssignment<DtekPreset>(html, 'DisconSchedule.preset');
  if (
    !fact &&
    !preset &&
    /incapsula|_Incapsula_Resource|incap_ses|Request unsuccessful/i.test(html)
  ) {
    throw new DtekBlockedError();
  }
  const csrf =
    /<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i.exec(
      html,
    )?.[1] ??
    /<meta\s+content=["']([^"']+)["']\s+name=["']csrf-token["']/i.exec(
      html,
    )?.[1] ??
    null;
  const streets = extractAssignment<unknown>(html, 'DisconSchedule.streets');
  return {
    csrf,
    fact,
    preset,
    streets: Array.isArray(streets)
      ? streets.filter((s): s is string => typeof s === 'string')
      : null,
  };
}

/** Street names to try with `getHomeNum`, best first: the page's own spelling, then as configured. */
export function streetCandidates(
  configured: string,
  pageStreets: string[] | null,
): string[] {
  const wanted = normalize(configured);
  const fromPage = (pageStreets ?? []).filter((s) =>
    normalize(s).includes(wanted),
  );
  fromPage.sort((a, b) => a.length - b.length);
  const plain = configured.trim();
  return [...new Set([...fromPage, plain, `вул. ${plain}`])];
}

/** Body for `POST /ua/ajax`, in the form the page's own jQuery call sends. */
export function homeNumBody(
  street: string,
  updateFact: string | undefined,
): URLSearchParams {
  const body = new URLSearchParams();
  body.set('method', 'getHomeNum');
  body.set('data[0][name]', 'street');
  body.set('data[0][value]', street);
  body.set('data[1][name]', 'updateFact');
  body.set('data[1][value]', updateFact ?? '');
  return body;
}

interface HomeNumResponse {
  result?: boolean;
  data?: Record<
    string,
    Partial<Record<'sub_type' | 'start_date' | 'end_date' | 'type', string>> & {
      sub_type_reason?: string[] | string;
    }
  >;
}

/** Finds the configured house in a `getHomeNum` response. Null when the street has no such house. */
export function parseHouse(response: unknown, house: string): DtekHouse | null {
  const data = (response as HomeNumResponse | null)?.data;
  if (!data || typeof data !== 'object') return null;
  const wanted = normalize(house);
  const key = Object.keys(data).find((k) => normalize(k) === wanted);
  if (!key) return null;
  const rec = data[key];
  const reasons = Array.isArray(rec.sub_type_reason)
    ? rec.sub_type_reason
    : rec.sub_type_reason
      ? [rec.sub_type_reason]
      : [];
  return {
    groupKey: reasons.find((r) => /^GPV/i.test(r)) ?? reasons[0] ?? null,
    reason: (rec.sub_type ?? '').trim(),
    start: parseDtekDate(rec.start_date),
    end: parseDtekDate(rec.end_date),
  };
}

/** `13:20 12.11.2026` or `12.11.2026 13:20` (local time) → Date. */
export function parseDtekDate(value: string | undefined): Date | null {
  if (!value) return null;
  const time = /(\d{1,2}):(\d{2})/.exec(value);
  const date = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(value);
  if (!time || !date) return null;
  return new Date(
    Number(date[3]),
    Number(date[2]) - 1,
    Number(date[1]),
    Number(time[1]),
    Number(time[2]),
  );
}

/** `GPV38.1` → `38.1` */
export function groupLabel(groupKey: string): string {
  return groupKey.replace(/^GPV/i, '');
}

/** Hour value → its two half-hour slots (PRD table). */
const HOUR_VALUES: Record<string, [SlotState, SlotState]> = {
  yes: ['on', 'on'],
  no: ['off', 'off'],
  first: ['off', 'on'],
  second: ['on', 'off'],
  maybe: ['maybe', 'maybe'],
  mfirst: ['maybe', 'on'],
  msecond: ['on', 'maybe'],
};

/** 24 hour keys ("1".."24", key N = (N−1):00–N:00) → 48 slots. */
export function hoursToSlots(
  hours: Record<string, string> | undefined,
): SlotState[] {
  const slots: SlotState[] = Array.from(
    { length: SLOTS_PER_DAY },
    () => 'unknown',
  );
  if (!hours) return slots;
  for (let h = 1; h <= 24; h++) {
    const pair = HOUR_VALUES[String(hours[String(h)] ?? '').toLowerCase()];
    if (pair) [slots[(h - 1) * 2], slots[(h - 1) * 2 + 1]] = pair;
  }
  return slots;
}

/** Actual schedule for one local date, or null when DTEK hasn't published it. */
export function factDay(
  fact: DtekFact | null,
  groupKey: string,
  dateKey: string,
): SlotState[] | null {
  if (!fact?.data) return null;
  for (const [ts, groups] of Object.entries(fact.data)) {
    if (
      localDateKey(new Date(Number(ts) * 1000)) === dateKey &&
      groups?.[groupKey]
    ) {
      return hoursToSlots(groups[groupKey]);
    }
  }
  return null;
}

/** Weekly plan for a local date (weekday 1 = Monday … 7 = Sunday). */
export function presetDay(
  preset: DtekPreset | null,
  groupKey: string,
  dateKey: string,
): SlotState[] | null {
  const week = preset?.data?.[groupKey];
  if (!week) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const weekday = ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1;
  return week[String(weekday)] ? hoursToSlots(week[String(weekday)]) : null;
}

/** Best source per slot: actual schedule → weekly plan → unknown (PRD "Pick the best source per slot"). */
export function mergeDay(
  dateKey: string,
  fact: SlotState[] | null,
  preset: SlotState[] | null,
): DaySchedule {
  const slots = Array.from({ length: SLOTS_PER_DAY }, (_, i): SlotState => {
    const f = fact?.[i];
    if (f && f !== 'unknown') return f;
    return preset?.[i] ?? 'unknown';
  });
  return { date: dateKey, slots };
}

export function hashSlots(slots: readonly string[]): string {
  return createHash('sha1').update(slots.join(',')).digest('hex').slice(0, 16);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s.,'’"«»-]/g, '')
    .replace(/^вул/, '');
}
