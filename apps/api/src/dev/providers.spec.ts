import { parseConfig } from '../config/config.loader';
import {
  ciState,
  githubPullRequests,
  renderState,
  supabaseState,
  vercelDeploys,
  vercelState,
} from './providers';
import { RealDevSource } from './real-dev.source';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function stubFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return json({ message: 'not found' }, 404);
    const value = routes[key];
    return value instanceof Response ? value : json(value);
  });
  return calls;
}

afterEach(() => {
  jest.restoreAllMocks();
  for (const k of [
    'VERCEL_TOKEN',
    'RENDER_API_KEY',
    'SUPABASE_ACCESS_TOKEN',
    'GITHUB_TOKEN',
    'VERCEL_TEAM_ID',
  ])
    delete process.env[k];
});

describe('state mapping', () => {
  it('maps provider states', () => {
    expect(vercelState('READY')).toBe('ready');
    expect(vercelState('BUILDING')).toBe('building');
    expect(vercelState('ERROR')).toBe('error');
    expect(renderState('live')).toBe('ready');
    expect(renderState('build_in_progress')).toBe('building');
    expect(renderState('update_failed')).toBe('error');
    expect(renderState('live', 'suspended')).toBe('paused');
    expect(supabaseState('ACTIVE_HEALTHY')).toBe('healthy');
    expect(supabaseState('INACTIVE')).toBe('paused');
  });

  it('rolls check runs up into one CI state', () => {
    expect(ciState([])).toBe('none');
    expect(
      ciState([
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: 'skipped' },
      ]),
    ).toBe('pass');
    expect(
      ciState([
        { status: 'in_progress', conclusion: null },
        { status: 'completed', conclusion: 'success' },
      ]),
    ).toBe('pending');
    expect(
      ciState([
        { status: 'in_progress', conclusion: null },
        { status: 'completed', conclusion: 'failure' },
      ]),
    ).toBe('fail');
  });
});

describe('API clients', () => {
  it('discovers Vercel projects and reads each latest deployment', async () => {
    const calls = stubFetch({
      '/v10/projects': { projects: [{ id: 'prj_1', name: 'keyboard-runner' }] },
      '/v6/deployments': {
        deployments: [{ readyState: 'READY', createdAt: 1_800_000_000_000 }],
      },
    });
    const result = await vercelDeploys('tok', 'team_1', null, 6);
    expect(result).toEqual([
      {
        name: 'keyboard-runner',
        provider: 'vercel',
        state: 'ready',
        lastDeployAt: new Date(1_800_000_000_000).toISOString(),
      },
    ]);
    expect(calls.every((c) => c.includes('teamId=team_1'))).toBe(true);
  });

  it('lists the newest open PRs across repos with their CI state', async () => {
    stubFetch({
      '/repos/o/a/pulls': [
        {
          number: 3,
          title: 'older',
          html_url: 'u3',
          head: { sha: 's3' },
          updated_at: '2026-11-10T00:00:00Z',
        },
      ],
      '/repos/o/b/pulls': [
        {
          number: 7,
          title: 'newer',
          html_url: 'u7',
          head: { sha: 's7' },
          updated_at: '2026-11-12T00:00:00Z',
        },
      ],
      '/commits/s7/check-runs': {
        check_runs: [{ status: 'completed', conclusion: 'failure' }],
      },
      '/commits/s3/check-runs': {
        check_runs: [{ status: 'completed', conclusion: 'success' }],
      },
    });
    const prs = await githubPullRequests('tok', ['o/a', 'o/b'], 4);
    expect(prs.map((p) => [p.repo, p.number, p.ci])).toEqual([
      ['b', 7, 'fail'],
      ['a', 3, 'pass'],
    ]);
  });
});

describe('RealDevSource', () => {
  it('reports missing tokens as notices and still shows the other sources', async () => {
    process.env['GITHUB_TOKEN'] = 'gh';
    stubFetch({ '/repos/o/a/pulls': [] });
    const source = new RealDevSource(parseConfig({ dev: { repos: ['o/a'] } }));
    const data = await source.fetch();
    expect(data.notices).toEqual([
      'Vercel: VERCEL_TOKEN not set',
      'Render: RENDER_API_KEY not set',
      'Supabase: SUPABASE_ACCESS_TOKEN not set',
    ]);
    expect(data.pullRequests).toEqual([]);
  });

  it('keeps going when one source fails', async () => {
    process.env['VERCEL_TOKEN'] = 'v';
    process.env['SUPABASE_ACCESS_TOKEN'] = 's';
    stubFetch({
      'api.vercel.com': json({ error: 'nope' }, 403),
      'api.supabase.com/v1/projects': [
        { id: 'ref1', ref: 'ref1', name: 'audioshelf', status: 'INACTIVE' },
      ],
    });
    const source = new RealDevSource(
      parseConfig({
        dev: {
          deploys: [
            { name: 'kr', provider: 'vercel' },
            { name: 'audioshelf', provider: 'supabase', id: 'ref1' },
          ],
        },
      }),
    );
    const data = await source.fetch();
    expect(data.deploys).toEqual([
      {
        name: 'audioshelf',
        provider: 'supabase',
        state: 'paused',
        lastDeployAt: null,
      },
    ]);
    expect(data.notices).toEqual(['Vercel: HTTP 403 (check the token)']);
  });

  it('shows notices when everything fails on the first run, then keeps old data stale on later failures', async () => {
    process.env['VERCEL_TOKEN'] = 'v';
    const source = new RealDevSource(
      parseConfig({ dev: { deploys: [{ name: 'kr', provider: 'vercel' }] } }),
    );

    stubFetch({});
    expect((await source.fetch()).notices).toEqual([
      'Vercel: HTTP 404 (not found)',
    ]);
    jest.restoreAllMocks();

    stubFetch({
      '/v6/deployments': {
        deployments: [{ readyState: 'READY', createdAt: 1 }],
      },
    });
    expect((await source.fetch()).deploys).toHaveLength(1);
    jest.restoreAllMocks();

    stubFetch({});
    await expect(source.fetch()).rejects.toThrow(/Vercel: HTTP 404/);
  });
});
