import { type AgendaItem, localDateKey } from '@side-screen/shared';
import ical from 'node-ical';

/**
 * Today's events from an iCalendar feed (Google Calendar's secret iCal address), with
 * recurring events expanded and cancelled ones dropped. Times are compared in local time.
 */
export function agendaFromIcs(
  ics: string,
  now: Date,
  opts: { hideAllDay?: boolean } = {},
): AgendaItem[] {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
  const today = localDateKey(now);
  const items: AgendaItem[] = [];

  for (const component of Object.values(ical.sync.parseICS(ics))) {
    if (!component || component.type !== 'VEVENT') continue;
    if (component.status === 'CANCELLED') continue;
    for (const instance of ical.expandRecurringEvent(component, {
      from,
      to,
      expandOngoing: true,
    })) {
      if (instance.event.status === 'CANCELLED') continue;
      if (instance.isFullDay && opts.hideAllDay) continue;
      const start = new Date(instance.start);
      const end = new Date(instance.end ?? instance.start);
      // All-day events come as UTC midnights; keep the ones that cover today locally.
      if (
        instance.isFullDay &&
        localDateKey(new Date(start.getTime() + 12 * 3_600_000)) !== today
      )
        continue;
      items.push({
        id: `${component.uid}@${start.toISOString()}`,
        start: (instance.isFullDay ? from : start).toISOString(),
        end: (instance.isFullDay ? to : end).toISOString(),
        title: summaryText(instance.summary) || '(no title)',
        kind: 'event',
        allDay: instance.isFullDay,
      });
    }
  }
  return items.sort(
    (a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
  );
}

function summaryText(summary: unknown): string {
  if (typeof summary === 'string') return summary.trim();
  if (summary && typeof summary === 'object' && 'val' in summary)
    return String((summary as { val: unknown }).val).trim();
  return '';
}
