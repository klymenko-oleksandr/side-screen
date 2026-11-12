const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = timeZone + JSON.stringify(options);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone, ...options });
    formatters.set(key, f);
  }
  return f;
}

type DateLike = Date | string;
const toDate = (d: DateLike) => (typeof d === 'string' ? new Date(d) : d);

/** `09:14` */
export function hhmm(d: DateLike, timeZone: string): string {
  return formatter(timeZone, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(toDate(d));
}

/** `09:14:05` */
export function hhmmss(d: DateLike, timeZone: string): string {
  return formatter(timeZone, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(toDate(d));
}

/** `Thursday` */
export function weekday(d: DateLike, timeZone: string): string {
  return formatter(timeZone, { weekday: 'long' }).format(toDate(d));
}

/** `12 November` */
export function dayMonth(d: DateLike, timeZone: string): string {
  return formatter(timeZone, { day: 'numeric', month: 'long' }).format(
    toDate(d),
  );
}
