import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** API tokens and other secrets, read from `.env` (git-ignored) or the environment (PRD N5). */
export const SECRET_KEYS = [
  'GOOGLE_CALENDAR_ICS_URL',
  'VERCEL_TOKEN',
  'VERCEL_TEAM_ID',
  'RENDER_API_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'GITHUB_TOKEN',
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];

/** Loads `.env` from the working directory into `process.env`, if present. Returns the path. */
export function loadDotEnv(cwd = process.cwd()): string | null {
  const path = resolve(cwd, '.env');
  if (!existsSync(path)) return null;
  process.loadEnvFile(path);
  return path;
}

export function secret(key: SecretKey, env = process.env): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}
