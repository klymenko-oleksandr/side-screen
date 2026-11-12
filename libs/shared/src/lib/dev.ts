import type { WithMeta } from './module-meta';

export type DeployProvider = 'vercel' | 'render' | 'supabase';
export type DeployState =
  'ready' | 'building' | 'error' | 'healthy' | 'paused' | 'unknown';

export interface DeployStatus {
  name: string;
  provider: DeployProvider;
  state: DeployState;
  /** ISO timestamp of the last deploy, if known. */
  lastDeployAt: string | null;
}

export type CiState = 'pass' | 'fail' | 'pending' | 'none';

export interface PullRequestStatus {
  repo: string;
  number: number;
  title: string;
  ci: CiState;
  url: string;
}

/** Claude Code session progress (PRD D5, later phase). */
export interface AgentSession {
  title: string;
  done: number;
  total: number;
  waitingForInput: boolean;
}

export interface DevData {
  deploys: DeployStatus[];
  pullRequests: PullRequestStatus[];
  session: AgentSession | null;
  /** Per-source problems, e.g. "Vercel: VERCEL_TOKEN not set". Other sources still show. */
  notices: string[];
}

export type DevSnapshot = WithMeta<DevData>;
