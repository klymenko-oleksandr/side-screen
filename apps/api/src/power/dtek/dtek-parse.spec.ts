import {
  DtekBlockedError,
  extractAssignment,
  factDay,
  groupLabel,
  homeNumBody,
  hoursToSlots,
  mergeDay,
  parseDtekDate,
  parseHouse,
  parsePage,
  presetDay,
  streetCandidates,
} from './dtek-parse';
import {
  BOT_WALL_HTML,
  homeNumResponse,
  midnight,
  pageHtml,
} from './dtek-fixtures';

describe('DTEK page parsing', () => {
  const html = pageHtml({
    today: midnight(2026, 11, 12),
    streets: ['вул. Зарічна', 'вул. Зарічна Нова', 'просп. Перемоги'],
  });

  it('reads fact, preset, CSRF token and streets from the page script', () => {
    const page = parsePage(html);
    expect(page.csrf).toBe('tok-123');
    expect(page.fact?.update).toBe('12.11.2026 20:47');
    expect(Object.keys(page.preset?.data ?? {})).toEqual(['GPV38.1']);
    expect(page.streets).toHaveLength(3);
  });

  it('copes with braces inside strings when matching the object', () => {
    expect(
      extractAssignment<{ a: string }>('x.y = {"a": "}{"}; z', 'x.y'),
    ).toEqual({ a: '}{' });
  });

  it('recognises the bot-protection page', () => {
    expect(() => parsePage(BOT_WALL_HTML)).toThrow(DtekBlockedError);
  });

  it('maps hour values to half-hour slots (PRD table)', () => {
    const slots = hoursToSlots({
      '1': 'yes',
      '2': 'no',
      '3': 'first',
      '4': 'second',
      '5': 'maybe',
      '6': 'mfirst',
      '7': 'msecond',
    });
    expect(slots.slice(0, 14)).toEqual([
      'on',
      'on',
      'off',
      'off',
      'off',
      'on',
      'on',
      'off',
      'maybe',
      'maybe',
      'maybe',
      'on',
      'on',
      'maybe',
    ]);
    expect(slots[47]).toBe('unknown');
  });

  it('picks the fact for a date by its local-midnight key', () => {
    const page = parsePage(html);
    const day = factDay(page.fact, 'GPV38.1', '2026-11-12');
    // Hour key 12 = 11:00–12:00 → slots 22, 23.
    expect(day?.slice(20, 34)).toEqual([
      'on',
      'on',
      'off',
      'off',
      'off',
      'off',
      'off',
      'off',
      'off',
      'off',
      'off',
      'off',
      'on',
      'on',
    ]);
    // Key 19 "second" = 18:30–19:00 off.
    expect(day?.slice(36, 38)).toEqual(['on', 'off']);
    expect(factDay(page.fact, 'GPV38.1', '2026-11-13')).toBeNull();
  });

  it('falls back to the weekly plan per slot', () => {
    const page = parsePage(html);
    const plan = presetDay(page.preset, 'GPV38.1', '2026-11-13');
    const merged = mergeDay('2026-11-13', null, plan);
    expect(merged.slots.slice(8, 12)).toEqual([
      'maybe',
      'maybe',
      'maybe',
      'on',
    ]);
    expect(
      mergeDay('2026-11-12', ['off', 'unknown'], ['on', 'maybe']).slots.slice(
        0,
        2,
      ),
    ).toEqual(['off', 'maybe']);
  });

  it('labels groups', () => {
    expect(groupLabel('GPV38.1')).toBe('38.1');
  });
});

describe('DTEK address lookup', () => {
  it('prefers the page spelling of the street, then the configured one', () => {
    expect(
      streetCandidates('Зарічна', [
        'просп. Перемоги',
        'вул. Зарічна Нова',
        'вул. Зарічна',
      ]),
    ).toEqual(['вул. Зарічна', 'вул. Зарічна Нова', 'Зарічна']);
    expect(streetCandidates('Зарічна', null)).toEqual([
      'Зарічна',
      'вул. Зарічна',
    ]);
  });

  it('builds the getHomeNum form body', () => {
    expect(homeNumBody('вул. Зарічна', '12.11.2026 20:47').toString()).toBe(
      'method=getHomeNum&data%5B0%5D%5Bname%5D=street&data%5B0%5D%5Bvalue%5D=%D0%B2%D1%83%D0%BB.+%D0%97%D0%B0%D1%80%D1%96%D1%87%D0%BD%D0%B0&data%5B1%5D%5Bname%5D=updateFact&data%5B1%5D%5Bvalue%5D=12.11.2026+20%3A47',
    );
  });

  it('finds the house regardless of case and spacing', () => {
    const res = homeNumResponse('1/Г', {
      sub_type: 'Стабілізаційне відключення',
      start_date: '13:20 12.11.2026',
      end_date: '17:00 12.11.2026',
    });
    const house = parseHouse(res, '1/г');
    expect(house?.groupKey).toBe('GPV38.1');
    expect(house?.reason).toBe('Стабілізаційне відключення');
    expect(house?.start).toEqual(new Date(2026, 10, 12, 13, 20));
    expect(house?.end).toEqual(new Date(2026, 10, 12, 17, 0));
    expect(parseHouse(res, '99')).toBeNull();
    expect(parseHouse({ result: false }, '1/Г')).toBeNull();
  });

  it('parses both date orders', () => {
    expect(parseDtekDate('12.11.2026 09:05')).toEqual(
      new Date(2026, 10, 12, 9, 5),
    );
    expect(parseDtekDate('')).toBeNull();
  });
});
