import {
  type DaySchedule,
  SLOT_MINUTES,
  SLOTS_PER_DAY,
  type SlotState,
} from '@side-screen/shared';

/**
 * Yasno's public planned-outages JSON (app.yasno.ua, the API behind yasno.ua), keyed by group:
 *
 *   { "38.1": { "today":    { "slots": [{ "start": 0, "end": 150, "type": "NotPlanned" }, …],
 *                             "date": "2026-11-12T00:00:00+02:00", "status": "ScheduleApplies" },
 *               "tomorrow": { "slots": [], "date": "…", "status": "WaitingForSchedule" },
 *               "updatedOn": "2026-11-11T19:00:01+00:00" }, … }
 *
 * `start`/`end` are minutes from local midnight. `Definite` = a cut, `NotPlanned` = power.
 */
export interface YasnoSlot {
  start: number;
  end: number;
  type: string;
}

export interface YasnoDay {
  slots?: YasnoSlot[];
  date?: string;
  status?: string;
}

export interface YasnoGroup {
  today?: YasnoDay;
  tomorrow?: YasnoDay;
  updatedOn?: string;
}

export type YasnoResponse = Record<string, YasnoGroup>;

const SLOT_TYPES: Record<string, SlotState> = {
  Definite: 'off',
  NotPlanned: 'on',
  Possible: 'maybe',
  Probable: 'maybe',
};

/** Statuses where the slots describe the day. */
const APPLIES = new Set(['ScheduleApplies']);

/** Human text for statuses that matter on screen. */
export function statusText(status: string | undefined): string | null {
  switch (status) {
    case undefined:
    case 'ScheduleApplies':
    case 'WaitingForSchedule':
      return null;
    case 'EmergencyShutdowns':
      return 'Emergency shutdowns: the schedule is not in effect';
    default:
      return `Yasno: ${status}`;
  }
}

/** One Yasno day → 48 half-hour slots, or null when the schedule doesn't apply (not published, emergency). */
export function yasnoDay(day: YasnoDay | undefined): DaySchedule | null {
  if (!day?.date || !APPLIES.has(day.status ?? '') || !day.slots?.length)
    return null;
  const slots: SlotState[] = Array.from({ length: SLOTS_PER_DAY }, (_, i) => {
    const minute = i * SLOT_MINUTES + SLOT_MINUTES / 2; // the slot's midpoint
    const range = day.slots?.find((s) => s.start <= minute && minute < s.end);
    return range ? (SLOT_TYPES[range.type] ?? 'unknown') : 'unknown';
  });
  // The date carries Kyiv's offset; its first 10 characters are the local date.
  return { date: day.date.slice(0, 10), slots };
}

/** Group labels are `38.1`; accept `GPV38.1` or `Черга 38.1` from the config too. */
export function normalizeGroup(group: string): string {
  return /(\d+(?:\.\d+)?)/.exec(group)?.[1] ?? group.trim();
}

/** Address lookup (the same calls yasno.ua makes): street → house → group. */
export interface YasnoAddressItem {
  id: number;
  value: string;
}

/** `1/Г`, `1 г`, `1Г` → `1г` */
export function normalizeHouse(house: string): string {
  return house.toLowerCase().replace(/[\s/\\-]/g, '');
}

/** `вул. Зарічна` / `Зарічна` → `зарічна` */
export function normalizeStreet(street: string): string {
  return street
    .toLowerCase()
    .replace(
      /^(вул|вулиця|просп|проспект|пров|провулок|бульв|бульвар|пл|площа)\.?\s*/u,
      '',
    )
    .replace(/[\s.,'’"«»-]/g, '');
}

/** Best street match: exact name first, then the shortest one that contains it. */
export function pickStreet(
  items: YasnoAddressItem[],
  street: string,
): YasnoAddressItem | null {
  const wanted = normalizeStreet(street);
  const exact = items.find((i) => normalizeStreet(i.value) === wanted);
  if (exact) return exact;
  return (
    items
      .filter((i) => normalizeStreet(i.value).includes(wanted))
      .sort((a, b) => a.value.length - b.value.length)[0] ?? null
  );
}

export function pickHouse(
  items: YasnoAddressItem[],
  house: string,
): YasnoAddressItem | null {
  const wanted = normalizeHouse(house);
  return items.find((i) => normalizeHouse(i.value) === wanted) ?? null;
}

/** The group endpoint answers `{ group: 38, subgroup: 1 }` (or a bare number). */
export function groupFromLookup(body: unknown): string | null {
  if (typeof body === 'number' || typeof body === 'string') return `${body}.1`;
  const b = body as {
    group?: number | string;
    subgroup?: number | string;
  } | null;
  if (b?.group === undefined || b.group === null) return null;
  return `${b.group}.${b.subgroup || 1}`;
}
