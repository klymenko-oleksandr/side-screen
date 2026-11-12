import { agendaFromIcs } from './ics';

const TZ = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Kiev',
  'BEGIN:STANDARD',
  'DTSTART:19701025T040000',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0200',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700329T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0300',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
];

const event = (lines: string[]) => [
  'BEGIN:VEVENT',
  'DTSTAMP:20261101T000000Z',
  ...lines,
  'END:VEVENT',
];

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  ...TZ,
  ...event([
    'UID:a',
    'DTSTART;TZID=Europe/Kiev:20261112T170000',
    'DTEND;TZID=Europe/Kiev:20261112T180000',
    'SUMMARY:Lemon.io interview',
  ]),
  ...event([
    'UID:b',
    'DTSTART;TZID=Europe/Kiev:20261102T093000',
    'DTEND;TZID=Europe/Kiev:20261102T110000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,TH',
    'SUMMARY:Deep work',
  ]),
  ...event([
    'UID:c',
    'DTSTART;VALUE=DATE:20261112',
    'DTEND;VALUE=DATE:20261113',
    'SUMMARY:Birthday',
  ]),
  ...event([
    'UID:d',
    'DTSTART;TZID=Europe/Kiev:20261112T120000',
    'DTEND;TZID=Europe/Kiev:20261112T130000',
    'STATUS:CANCELLED',
    'SUMMARY:Cancelled',
  ]),
  ...event([
    'UID:e',
    'DTSTART;TZID=Europe/Kiev:20261113T100000',
    'DTEND;TZID=Europe/Kiev:20261113T110000',
    'SUMMARY:Tomorrow',
  ]),
  'END:VCALENDAR',
].join('\r\n');

// Run in Kyiv local time so "today" means the same thing as on the Mac.
const NOW = new Date('2026-11-12T07:14:00Z');

describe('agendaFromIcs', () => {
  it("lists today's events including recurring and all-day ones, without cancelled or other days", () => {
    const items = agendaFromIcs(ICS, NOW);
    expect(items.map((i) => i.title)).toEqual([
      'Birthday',
      'Deep work',
      'Lemon.io interview',
    ]);
    expect(items.find((i) => i.title === 'Deep work')?.start).toBe(
      '2026-11-12T07:30:00.000Z',
    );
    expect(items.find((i) => i.title === 'Birthday')?.allDay).toBe(true);
  });

  it('can hide all-day events', () => {
    expect(
      agendaFromIcs(ICS, NOW, { hideAllDay: true }).map((i) => i.title),
    ).toEqual(['Deep work', 'Lemon.io interview']);
  });
});
