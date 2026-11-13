import type {
  CiState,
  DeployState,
  DeployStatus,
  PullRequestStatus,
} from '@side-screen/shared';
import { getJson } from './http';

/** A deploy target to show: from the config, or discovered when the config lists none. */
export interface DeployTarget {
  name: string;
  id: string;
}

// Vercel (D1)

interface VercelProject {
  id: string;
  name: string;
}
interface VercelDeployment {
  state?: string;
  readyState?: string;
  createdAt?: number;
  created?: number;
}

export function vercelState(state: string | undefined): DeployState {
  switch ((state ?? '').toUpperCase()) {
    case 'READY':
      return 'ready';
    case 'BUILDING':
    case 'INITIALIZING':
    case 'QUEUED':
      return 'building';
    case 'ERROR':
      return 'error';
    case 'CANCELED':
      return 'unknown';
    default:
      return 'unknown';
  }
}

export async function vercelDeploys(
  token: string,
  teamId: string | undefined,
  targets: DeployTarget[] | null,
  max: number,
): Promise<DeployStatus[]> {
  const team = teamId ? `&teamId=${encodeURIComponent(teamId)}` : '';
  const list =
    targets ??
    (
      await getJson<{ projects: VercelProject[] }>(
        `https://api.vercel.com/v10/projects?limit=${max}${team}`,
        token,
      )
    ).projects.map((p) => ({
      name: p.name,
      id: p.id,
    }));
  return Promise.all(
    list.map(async (t): Promise<DeployStatus> => {
      const { deployments } = await getJson<{
        deployments: VercelDeployment[];
      }>(
        `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(t.id)}&limit=1${team}`,
        token,
      );
      const d = deployments[0];
      const created = d?.createdAt ?? d?.created;
      return {
        name: t.name,
        provider: 'vercel',
        state: d ? vercelState(d.readyState ?? d.state) : 'unknown',
        lastDeployAt: created ? new Date(created).toISOString() : null,
      };
    }),
  );
}

// Render (D1)

interface RenderService {
  service: { id: string; name: string; suspended?: string };
}
interface RenderDeploy {
  deploy: { status?: string; finishedAt?: string | null; createdAt?: string };
}

export function renderState(
  status: string | undefined,
  suspended?: string,
): DeployState {
  if (suspended && suspended !== 'not_suspended') return 'paused';
  const s = status ?? '';
  if (s === 'live') return 'ready';
  if (s.endsWith('_in_progress') || s === 'created' || s === 'queued')
    return 'building';
  if (s.endsWith('_failed')) return 'error';
  if (s === 'deactivated') return 'paused';
  return 'unknown';
}

export async function renderDeploys(
  token: string,
  targets: DeployTarget[] | null,
  max: number,
): Promise<DeployStatus[]> {
  const services = await getJson<RenderService[]>(
    `https://api.render.com/v1/services?limit=50`,
    token,
  );
  const chosen = targets
    ? targets
        .map((t) => ({
          target: t,
          svc: services.find(
            (s) => s.service.id === t.id || s.service.name === t.id,
          ),
        }))
        .map(({ target, svc }) => ({
          name: target.name,
          id: svc?.service.id ?? null,
          suspended: svc?.service.suspended,
        }))
    : services.slice(0, max).map((s) => ({
        name: s.service.name,
        id: s.service.id,
        suspended: s.service.suspended,
      }));

  return Promise.all(
    chosen.map(async (svc): Promise<DeployStatus> => {
      if (!svc.id)
        return {
          name: svc.name,
          provider: 'render',
          state: 'unknown',
          lastDeployAt: null,
        };
      const deploys = await getJson<RenderDeploy[]>(
        `https://api.render.com/v1/services/${svc.id}/deploys?limit=1`,
        token,
      );
      const d = deploys[0]?.deploy;
      return {
        name: svc.name,
        provider: 'render',
        state: renderState(d?.status, svc.suspended),
        lastDeployAt: d?.finishedAt ?? d?.createdAt ?? null,
      };
    }),
  );
}

// Supabase (D2)

interface SupabaseProject {
  ref?: string;
  id: string;
  name: string;
  status: string;
}

export function supabaseState(status: string): DeployState {
  if (status === 'ACTIVE_HEALTHY') return 'healthy';
  if (status === 'INACTIVE' || status === 'PAUSED' || status === 'PAUSING')
    return 'paused';
  if (
    [
      'COMING_UP',
      'RESTORING',
      'UPGRADING',
      'GOING_DOWN',
      'RESTARTING',
    ].includes(status)
  )
    return 'building';
  if (status.includes('UNHEALTHY') || status.includes('FAILED')) return 'error';
  return 'unknown';
}

export async function supabaseHealth(
  token: string,
  targets: DeployTarget[] | null,
  max: number,
): Promise<DeployStatus[]> {
  const projects = await getJson<SupabaseProject[]>(
    'https://api.supabase.com/v1/projects',
    token,
  );
  const chosen = targets
    ? targets.map((t) => ({
        name: t.name,
        p: projects.find((p) => (p.ref ?? p.id) === t.id || p.name === t.id),
      }))
    : projects.slice(0, max).map((p) => ({ name: p.name, p }));
  return chosen.map(({ name, p }) => ({
    name,
    provider: 'supabase',
    state: p ? supabaseState(p.status) : 'unknown',
    lastDeployAt: null,
  }));
}

// GitHub PRs and CI (D3)

interface GhPull {
  number: number;
  title: string;
  html_url: string;
  user?: { login: string; type?: string };
  draft?: boolean;
  head: { sha: string };
  updated_at: string;
}
interface GhCheckRuns {
  check_runs: Array<{ status: string; conclusion: string | null }>;
}

export function ciState(runs: GhCheckRuns['check_runs']): CiState {
  if (runs.length === 0) return 'none';
  if (
    runs.some((r) =>
      [
        'failure',
        'timed_out',
        'cancelled',
        'action_required',
        'startup_failure',
      ].includes(r.conclusion ?? ''),
    )
  )
    return 'fail';
  if (runs.some((r) => r.status !== 'completed')) return 'pending';
  return 'pass';
}

const CI_RANK: Record<CiState, number> = {
  fail: 3,
  pending: 2,
  pass: 1,
  none: 0,
};

function shortRepo(repo: string): string {
  return repo.split('/')[1] ?? repo;
}

function isBot(p: GhPull): boolean {
  return p.user?.type === 'Bot' || /\[bot\]$/.test(p.user?.login ?? '');
}

const GH_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

/** GitHub sends a token's expiry as `github-authentication-token-expiration: 2027-02-10 12:00:00 +0200`. */
export function parseTokenExpiry(header: string | null): Date | null {
  const m =
    /(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*(?:([+-]\d{2})(\d{2})|UTC|Z)?/.exec(
      header ?? '',
    );
  if (!m) return null;
  const offset = m[3] ? `${m[3]}:${m[4]}` : 'Z';
  const date = new Date(`${m[1]}T${m[2]}${offset}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface GithubResult {
  pullRequests: PullRequestStatus[];
  tokenExpiresAt: Date | null;
}

export async function githubPullRequests(
  token: string | undefined,
  repos: string[],
  max: number,
): Promise<GithubResult> {
  let tokenExpiresAt: Date | null = null;
  const perRepo = await Promise.all(
    repos.map(async (repo) => {
      const pulls = await getJson<GhPull[]>(
        `https://api.github.com/repos/${repo}/pulls?state=open&per_page=30&sort=updated&direction=desc`,
        token,
        GH_HEADERS,
        (res) => {
          tokenExpiresAt ??= parseTokenExpiry(
            res.headers.get('github-authentication-token-expiration'),
          );
        },
      );
      return pulls.map((p) => ({ repo, p }));
    }),
  );
  const all = perRepo.flat();
  const ciFor = async (repo: string, sha: string): Promise<CiState> => {
    const runs = await getJson<GhCheckRuns>(
      `https://api.github.com/repos/${repo}/commits/${sha}/check-runs?per_page=50`,
      token,
      GH_HEADERS,
    ).catch(() => ({ check_runs: [] }));
    return ciState(runs.check_runs);
  };

  // People's PRs one per row, newest first.
  const human = all
    .filter(({ p }) => !isBot(p))
    .sort((a, b) => b.p.updated_at.localeCompare(a.p.updated_at))
    .slice(0, max);
  const humanRows = await Promise.all(
    human.map(async ({ repo, p }): Promise<PullRequestStatus> => ({
      repo: shortRepo(repo),
      number: p.number,
      title: p.title,
      ci: await ciFor(repo, p.head.sha),
      url: p.html_url,
    })),
  );

  // Bot PRs (Dependabot, Renovate) folded into one row per repo, with the worst CI state.
  const botsByRepo = new Map<string, GhPull[]>();
  for (const { repo, p } of all.filter(({ p }) => isBot(p))) {
    botsByRepo.set(repo, [...(botsByRepo.get(repo) ?? []), p]);
  }
  const botRows = await Promise.all(
    [...botsByRepo].map(async ([repo, pulls]): Promise<PullRequestStatus> => {
      const states = await Promise.all(
        pulls.map((p) => ciFor(repo, p.head.sha)),
      );
      const worst = states.reduce<CiState>(
        (w, c) => (CI_RANK[c] > CI_RANK[w] ? c : w),
        'none',
      );
      return {
        repo: shortRepo(repo),
        number: pulls[0].number,
        title: `${pulls.length} dependency update${pulls.length === 1 ? '' : 's'}`,
        ci: worst,
        url: `https://github.com/${repo}/pulls?q=is%3Apr+is%3Aopen+author%3Aapp%2Fdependabot`,
        bot: true,
        count: pulls.length,
      };
    }),
  );

  const pullRequests = [...humanRows, ...botRows].slice(0, max);
  return { pullRequests, tokenExpiresAt };
}
