/**
 * Every dashboard module carries the same freshness metadata (PRD S2, N3):
 * when its data was last refreshed, and whether the source is currently failing.
 */
export interface ModuleMeta {
  /** ISO timestamp of the last successful refresh. */
  updatedAt: string;
  /** True when the latest refresh failed and the data shown is the last good copy. */
  stale: boolean;
  /** True while the module is fed by mock data (phase 1). */
  mock: boolean;
}

export type WithMeta<T> = T & { meta: ModuleMeta };
