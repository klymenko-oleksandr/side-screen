import { parseConfig } from '../../config/config.loader';
import { Storage } from '../../storage/storage';
import {
  normalizeGroup,
  statusText,
  yasnoDay,
  type YasnoResponse,
} from './yasno-parse';
import { YasnoService } from './yasno.service';

/** Shaped like app.yasno.ua's planned-outages answer (2026-11-12). */
const RESPONSE: YasnoResponse = {
  '38.1': {
    today: {
      slots: [
        { start: 0, end: 150, type: 'NotPlanned' },
        { start: 150, end: 450, type: 'Definite' },
        { start: 450, end: 660, type: 'NotPlanned' },
        { start: 660, end: 1020, type: 'Definite' },
        { start: 1020, end: 1140, type: 'NotPlanned' },
        { start: 1140, end: 1440, type: 'Definite' },
      ],
      date: '2026-11-12T00:00:00+02:00',
      status: 'ScheduleApplies',
    },
    tomorrow: {
      slots: [],
      date: '2026-11-13T00:00:00+02:00',
      status: 'WaitingForSchedule',
    },
    updatedOn: '2026-11-11T19:00:01+00:00',
  },
  '1.1': {
    today: {
      slots: [],
      date: '2026-11-12T00:00:00+02:00',
      status: 'ScheduleApplies',
    },
  },
};

const NOW = new Date(2026, 10, 12, 10, 44);

describe('yasno parsing', () => {
  it('turns minute ranges into 48 half-hour slots', () => {
    const day = yasnoDay(RESPONSE['38.1'].today);
    expect(day?.date).toBe('2026-11-12');
    expect(day?.slots).toHaveLength(48);
    // 02:30–07:30 off → slots 5..14; 11:00–17:00 off → slots 22..33.
    expect(day?.slots.slice(4, 16)).toEqual([
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
    ]);
    expect(day?.slots[22]).toBe('off');
    expect(day?.slots[34]).toBe('on');
    expect(day?.slots[47]).toBe('off');
  });

  it('treats an unpublished or suspended day as no schedule', () => {
    expect(yasnoDay(RESPONSE['38.1'].tomorrow)).toBeNull();
    expect(
      yasnoDay({
        slots: [{ start: 0, end: 1440, type: 'Definite' }],
        date: '2026-11-12',
        status: 'EmergencyShutdowns',
      }),
    ).toBeNull();
    expect(statusText('EmergencyShutdowns')).toMatch(/Emergency/);
    expect(statusText('WaitingForSchedule')).toBeNull();
  });

  it('accepts the group in any spelling', () => {
    expect(normalizeGroup('GPV38.1')).toBe('38.1');
    expect(normalizeGroup('Черга 38.1')).toBe('38.1');
    expect(normalizeGroup('38.1')).toBe('38.1');
  });
});

describe('YasnoService', () => {
  const config = parseConfig({ power: { group: '38.1' } });
  let storage: Storage;

  const stubFetch = (body: unknown, status = 200) =>
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    );

  beforeEach(() => (storage = new Storage(':memory:')));
  afterEach(() => jest.restoreAllMocks());

  it('fetches the group schedule and stores it for offline use', async () => {
    const fetchMock = stubFetch(RESPONSE);
    const yasno = new YasnoService(config, storage);
    const result = await yasno.refreshNow(NOW);

    expect(result).toEqual({
      refreshed: true,
      message: 'Schedule checked',
      retryInSec: 60,
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/25/dsos/902/planned-outages',
    );
    const view = yasno.schedule(NOW);
    expect(view.group).toBe('38.1');
    expect(view.today?.slots[22]).toBe('off');
    expect(view.tomorrow).toBeNull();
    expect(view.publishedAt).toBe('2026-11-11T19:00:01+00:00');
    expect(view.fetchedAt).toBe(NOW.getTime());
    expect(view.nextFetchAt).toBe(NOW.getTime() + 30 * 60_000);

    // A restart with no internet still shows today.
    jest.restoreAllMocks();
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'));
    const offline = new YasnoService(config, storage);
    await offline.refreshNow(NOW);
    expect(offline.schedule(NOW).today?.slots[22]).toBe('off');
    expect(offline.schedule(NOW).error).toBe('fetch failed');
  });

  it('answers repeated presses from cache for a minute', async () => {
    const fetchMock = stubFetch(RESPONSE);
    const yasno = new YasnoService(config, storage);
    await yasno.refreshNow(NOW);
    const again = await yasno.refreshNow(new Date(NOW.getTime() + 20_000));
    expect(again).toEqual({
      refreshed: false,
      message: 'Checked moments ago; try again in 40 s',
      retryInSec: 40,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await yasno.refreshNow(new Date(NOW.getTime() + 61_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('polls in the background at most every scheduleMinutes', () => {
    const fetchMock = stubFetch(RESPONSE);
    const yasno = new YasnoService(config, storage);
    yasno.ensureFresh(NOW);
    yasno.ensureFresh(new Date(NOW.getTime() + 5 * 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('finds the group from the address, as yasno.ua does', async () => {
    const calls: string[] = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      const body = url.includes('/addresses/v2/streets')
        ? [{ id: 310, value: 'вул. Зарічна' }]
        : url.includes('/addresses/v2/houses')
          ? [
              { id: 13764, value: '1' },
              { id: 13766, value: '1В' },
              { id: 13767, value: '1Г' },
            ]
          : url.includes('/addresses/v2/group')
            ? { group: 38, subgroup: 1 }
            : RESPONSE;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const yasno = new YasnoService(
      parseConfig({ power: { address: { street: 'Зарічна', house: '1/Г' } } }),
      storage,
    );
    await yasno.refreshNow(NOW);

    expect(yasno.schedule(NOW).group).toBe('38.1');
    expect(yasno.schedule(NOW).today?.slots[22]).toBe('off');
    expect(calls.find((c) => c.includes('/group?'))).toContain(
      'streetId=310&houseId=13767',
    );

    // Looked up once, then cached.
    await yasno.refreshNow(new Date(NOW.getTime() + 61_000));
    expect(calls.filter((c) => c.includes('/addresses/'))).toHaveLength(3);
  });

  it('says when the group is not in the list', async () => {
    stubFetch({ '1.1': RESPONSE['1.1'] });
    const yasno = new YasnoService(
      parseConfig({ power: { group: '99.9' } }),
      storage,
    );
    const result = await yasno.refreshNow(NOW);
    expect(result.refreshed).toBe(false);
    expect(result.message).toMatch(/group 99\.9 not in Yasno's list/);
  });

  it('asks for the group when none is set', async () => {
    const fetchMock = stubFetch(RESPONSE);
    const yasno = new YasnoService(parseConfig({}), storage);
    expect((await yasno.refreshNow(NOW)).message).toMatch(/power\.group/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(yasno.schedule(NOW).group).toBeNull();
  });
});
