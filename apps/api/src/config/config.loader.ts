import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { configSchema, type SideScreenConfig } from './config.schema';

export const CONFIG_FILE = 'config/side-screen.config.json';
export const EXAMPLE_CONFIG_FILE = 'config/side-screen.config.example.json';

export interface LoadedConfig {
  config: SideScreenConfig;
  /** Absolute path of the file that was read. */
  path: string;
  /** True when the real config was missing and the example was used. */
  usedExample: boolean;
}

/**
 * Reads and validates the config at boot. Throws a readable error on a bad file,
 * so the launchd agent fails loudly instead of running with silent defaults.
 *
 * Lookup: `$SIDE_SCREEN_CONFIG`, then `config/side-screen.config.json`, then the example.
 */
export function loadConfig(
  cwd = process.cwd(),
  env = process.env,
): LoadedConfig {
  const explicit = env['SIDE_SCREEN_CONFIG'];
  const candidates = explicit
    ? [resolve(cwd, explicit)]
    : [resolve(cwd, CONFIG_FILE), resolve(cwd, EXAMPLE_CONFIG_FILE)];

  const path = candidates.find((p) => existsSync(p));
  if (!path) {
    throw new Error(
      `Side Screen config not found. Looked in: ${candidates.join(', ')}`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(
      `Side Screen config at ${path} is not valid JSON: ${(err as Error).message}`,
    );
  }

  return {
    config: parseConfig(raw, path),
    path,
    usedExample: !explicit && path.endsWith(EXAMPLE_CONFIG_FILE),
  };
}

export function parseConfig(raw: unknown, path = 'config'): SideScreenConfig {
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Side Screen config at ${path} is invalid:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
