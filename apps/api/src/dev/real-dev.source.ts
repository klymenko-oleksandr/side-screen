import { Inject, Injectable } from '@nestjs/common';
import type {
  DeployProvider,
  DeployStatus,
  PullRequestStatus,
} from '@side-screen/shared';
import { SIDE_SCREEN_CONFIG } from '../config/config.module';
import type { SideScreenConfig } from '../config/config.schema';
import { type SecretKey, secret } from '../config/env';
import type { ModuleData } from '../snapshot/snapshot';
import { DevSource } from './dev.source';
import { describeFetchError } from './http';
import {
  type DeployTarget,
  type GithubResult,
  githubPullRequests,
  renderDeploys,
  supabaseHealth,
  vercelDeploys,
} from './providers';

const PROVIDERS: Array<{
  provider: DeployProvider;
  label: string;
  token: SecretKey;
}> = [
  { provider: 'vercel', label: 'Vercel', token: 'VERCEL_TOKEN' },
  { provider: 'render', label: 'Render', token: 'RENDER_API_KEY' },
  { provider: 'supabase', label: 'Supabase', token: 'SUPABASE_ACCESS_TOKEN' },
];

/**
 * Real Dev module data. Deploy targets come from `dev.deploys` in the config; when that list is
 * empty, everything each token can see is shown (up to `dev.maxDeploys`). Each source fails on its
 * own: its problem becomes a notice and the others still show. Only when every source fails does
 * the module go stale and keep its last data.
 */
@Injectable()
export class RealDevSource extends DevSource {
  readonly label = 'dev sources';
  readonly mock = false;
  private loadedOnce = false;

  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
  ) {
    super();
  }

  async fetch(): Promise<ModuleData<'dev'>> {
    const {
      deploys: configured,
      repos,
      maxDeploys,
      maxPullRequests,
    } = this.config.dev;
    const discover = configured.length === 0;
    const notices: string[] = [];
    const jobs: Array<{
      label: string;
      run: () => Promise<DeployStatus[] | GithubResult>;
    }> = [];

    for (const { provider, label, token: tokenKey } of PROVIDERS) {
      const targets: DeployTarget[] | null = discover
        ? null
        : configured
            .filter((d) => d.provider === provider)
            .map((d) => ({ name: d.name, id: d.id ?? d.name }));
      if (targets?.length === 0) continue;
      const token = secret(tokenKey);
      if (!token) {
        notices.push(`${label}: ${tokenKey} not set`);
        continue;
      }
      if (provider === 'vercel')
        jobs.push({
          label,
          run: () =>
            vercelDeploys(token, secret('VERCEL_TEAM_ID'), targets, maxDeploys),
        });
      if (provider === 'render')
        jobs.push({
          label,
          run: () => renderDeploys(token, targets, maxDeploys),
        });
      if (provider === 'supabase')
        jobs.push({
          label,
          run: () => supabaseHealth(token, targets, maxDeploys),
        });
    }
    if (repos.length) {
      jobs.push({
        label: 'GitHub',
        run: () =>
          githubPullRequests(secret('GITHUB_TOKEN'), repos, maxPullRequests),
      });
    }

    const results = await Promise.allSettled(jobs.map((j) => j.run()));
    const deploys: DeployStatus[] = [];
    let pullRequests: PullRequestStatus[] = [];
    let failures = 0;

    results.forEach((result, i) => {
      const job = jobs[i];
      if (result.status === 'rejected') {
        failures++;
        notices.push(`${job.label}: ${describeFetchError(result.reason)}`);
      } else if (job.label === 'GitHub') {
        const gh = result.value as GithubResult;
        pullRequests = gh.pullRequests;
        const expiry = expiryNotice(gh.tokenExpiresAt, new Date());
        if (expiry) notices.push(expiry);
      } else {
        deploys.push(...(result.value as DeployStatus[]));
      }
    });

    // Everything failed (e.g. offline): keep the last good data on screen, marked stale.
    if (this.loadedOnce && jobs.length > 0 && failures === jobs.length) {
      throw new Error(notices.join('; '));
    }
    if (failures < jobs.length) this.loadedOnce = true;

    return {
      deploys: deploys.slice(0, maxDeploys),
      pullRequests,
      session: null,
      notices,
    };
  }
}

const EXPIRY_WARN_DAYS = 14;

/** "GitHub token expires in 9 days (10 Feb)": shown during the last two weeks of a token's life. */
export function expiryNotice(expiresAt: Date | null, now: Date): string | null {
  if (!expiresAt) return null;
  const days = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (days > EXPIRY_WARN_DAYS) return null;
  const date = expiresAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
  if (days <= 0)
    return `GitHub: GITHUB_TOKEN expired on ${date}; generate a new one`;
  return `GitHub: GITHUB_TOKEN expires in ${days} day${days === 1 ? '' : 's'} (${date}); regenerate it`;
}
