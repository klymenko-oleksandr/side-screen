import { SnapshotSource } from '../snapshot/snapshot';

/** DI token: Vercel / Render deploys (D1), Supabase health (D2), GitHub PRs and CI (D3). */
export abstract class DevSource extends SnapshotSource<'dev'> {}
