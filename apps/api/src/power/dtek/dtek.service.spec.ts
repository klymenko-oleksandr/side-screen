import { parseConfig } from '../../config/config.loader';
import { Storage } from '../../storage/storage';
import {
  BOT_WALL_HTML,
  homeNumResponse,
  midnight,
  pageHtml,
} from './dtek-fixtures';
import { DtekService } from './dtek.service';

const NOW = new Date(2026, 10, 12, 9, 14);
const config = parseConfig({
  power: { address: { street: 'Зарічна', house: '1/Г' } },
});

type Handler = (url: string, init: RequestInit) => Response;

function stubFetch(handler: Handler) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init = {}) => {
      const url = String(input);
      calls.push({ url, init });
      return handler(url, init);
    });
  return calls;
}

const html = (body: string, cookies: string[] = []) => {
  const headers = new Headers({ 'content-type': 'text/html' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(body, { status: 200, headers });
};
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('DtekService', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = new Storage(':memory:');
  });

  afterEach(() => jest.restoreAllMocks());

  it('loads the schedule and the house, then exposes the group schedule', async () => {
    const calls = stubFetch((url, init) => {
      if (url.endsWith('/ua/shutdowns')) {
        return html(
          pageHtml({
            today: midnight(2026, 11, 12),
            streets: ['вул. Зарічна'],
          }),
          ['PHPSESSID=abc; path=/', 'incap_ses_1=x; path=/'],
        );
      }
      const body = new URLSearchParams(String(init.body));
      return json(
        body.get('data[0][value]') === 'вул. Зарічна'
          ? homeNumResponse('1/Г')
          : { result: true, data: {} },
      );
    });
    const dtek = new DtekService(config, storage);
    await dtek.refreshNow(NOW);

    const view = dtek.view(NOW);
    expect(view.error).toBeNull();
    expect(view.group).toBe('38.1');
    expect(view.street).toBe('вул. Зарічна');
    expect(view.today?.slots[24]).toBe('off');
    expect(view.tomorrow).toBeNull();

    // The session cookie and CSRF token go with the lookup.
    const post = calls.find((c) => c.init.method === 'POST');
    const headers = post?.init.headers as Record<string, string>;
    expect(headers['Cookie']).toContain('PHPSESSID=abc');
    expect(headers['X-CSRF-Token']).toBe('tok-123');
    expect(headers['User-Agent']).toContain('SideScreen');

    // Today's schedule is stored for offline use.
    expect(
      storage.latestSnapshot('2026-11-12', 'GPV38.1', 'fact')?.slots[24],
    ).toBe('off');
  });

  it('shows tomorrow once it appears in the fact data', async () => {
    stubFetch((url) =>
      url.endsWith('/ua/shutdowns')
        ? html(
            pageHtml({
              today: midnight(2026, 11, 12),
              tomorrow: midnight(2026, 11, 13),
            }),
          )
        : json(homeNumResponse('1/Г')),
    );
    const dtek = new DtekService(config, storage);
    await dtek.refreshNow(NOW);
    expect(dtek.view(NOW).tomorrow?.slots[16]).toBe('off');
  });

  it('reports the bot-protection page and falls back to the stored schedule', async () => {
    // A good fetch first, so a schedule is stored.
    stubFetch((url) =>
      url.endsWith('/ua/shutdowns')
        ? html(pageHtml({ today: midnight(2026, 11, 12) }))
        : json(homeNumResponse('1/Г')),
    );
    await new DtekService(config, storage).refreshNow(NOW);
    jest.restoreAllMocks();

    // A fresh process (restart) that only sees the bot wall.
    stubFetch(() => html(BOT_WALL_HTML));
    const dtek = new DtekService(config, storage);
    await dtek.refreshNow(NOW);

    const view = dtek.view(NOW);
    expect(view.error).toMatch(/bot-protection/);
    expect(view.group).toBe('38.1');
    expect(view.today?.slots[24]).toBe('off');
  });

  it('says when the house is not on the street', async () => {
    stubFetch((url) =>
      url.endsWith('/ua/shutdowns')
        ? html(pageHtml({ today: midnight(2026, 11, 12) }))
        : json({ result: true, data: {} }),
    );
    const dtek = new DtekService(config, storage);
    await dtek.refreshNow(NOW);
    expect(dtek.view(NOW).error).toMatch(/house "1\/Г" not found on "Зарічна"/);
  });

  it('does nothing until an address is configured', async () => {
    const calls = stubFetch(() => html(''));
    const dtek = new DtekService(parseConfig({}), storage);
    dtek.ensureFresh(NOW);
    await dtek.refreshNow(NOW);
    expect(calls).toHaveLength(0);
    expect(dtek.configured).toBe(false);
  });
});
