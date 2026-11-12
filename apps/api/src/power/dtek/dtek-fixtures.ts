/**
 * Test fixtures shaped like the DTEK page as recorded in the PRD (2026-11-12).
 * Kept small: one group, one day of "fact", a week of "preset".
 */

/** Unix seconds of local midnight for a date. */
export const midnight = (y: number, m: number, d: number) =>
  Math.floor(new Date(y, m - 1, d).getTime() / 1000);

const allYes = () =>
  Object.fromEntries(
    Array.from({ length: 24 }, (_, i) => [String(i + 1), 'yes']),
  );

export function factHours(off: Record<number, string>): Record<string, string> {
  return {
    ...allYes(),
    ...Object.fromEntries(Object.entries(off).map(([h, v]) => [String(h), v])),
  };
}

export function pageHtml(
  opts: {
    today: number;
    tomorrow?: number;
    streets?: string[];
    csrf?: string;
  } = { today: midnight(2026, 11, 12) },
): string {
  const fact = {
    data: {
      [opts.today]: {
        'GPV38.1': factHours({
          12: 'no',
          13: 'no',
          14: 'no',
          15: 'no',
          16: 'no',
          19: 'second',
        }),
        'GPV1.1': factHours({}),
      },
      ...(opts.tomorrow
        ? { [opts.tomorrow]: { 'GPV38.1': factHours({ 9: 'no', 10: 'no' }) } }
        : {}),
    },
    update: '12.11.2026 20:47',
    today: opts.today,
  };
  const preset = {
    data: {
      'GPV38.1': Object.fromEntries(
        Array.from({ length: 7 }, (_, d) => [
          String(d + 1),
          { ...allYes(), '5': 'maybe', '6': 'mfirst', '21': 'msecond' },
        ]),
      ),
    },
  };
  return `<!doctype html><html><head>
    <meta name="csrf-token" content="${opts.csrf ?? 'tok-123'}">
    </head><body><script>
      var DisconSchedule = {};
      DisconSchedule.preset = ${JSON.stringify(preset)};
      DisconSchedule.fact = ${JSON.stringify(fact)};
      ${opts.streets ? `DisconSchedule.streets = ${JSON.stringify(opts.streets)};` : ''}
      var other = "a string with } and { inside";
    </script></body></html>`;
}

export function homeNumResponse(
  house: string,
  rec: Partial<Record<'sub_type' | 'start_date' | 'end_date', string>> = {},
) {
  return {
    result: true,
    data: {
      '1': {
        sub_type: '',
        start_date: '',
        end_date: '',
        type: '',
        sub_type_reason: ['GPV12.1'],
      },
      [house]: {
        sub_type: '',
        start_date: '',
        end_date: '',
        type: '',
        sub_type_reason: ['GPV38.1'],
        ...rec,
      },
    },
  };
}

export const BOT_WALL_HTML =
  '<html><head><META NAME="robots" CONTENT="noindex,nofollow"><script src="/_Incapsula_Resource?SWJIYLWA=5074a744"></script></head><body></body></html>';
