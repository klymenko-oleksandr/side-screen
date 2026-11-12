import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  type DynamicModule,
  Global,
  Module,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { GridStatus } from '@side-screen/shared';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS power_events (
     at INTEGER NOT NULL,
     status TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS power_events_at ON power_events (at)`,
  `CREATE TABLE IF NOT EXISTS schedule_snapshots (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     fetched_at INTEGER NOT NULL,
     dtek_update TEXT,
     kind TEXT NOT NULL,
     date TEXT NOT NULL,
     grp TEXT NOT NULL,
     slots TEXT NOT NULL,
     hash TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS schedule_snapshots_date ON schedule_snapshots (date, grp, kind, id)`,
];

export interface PowerEvent {
  at: number;
  status: GridStatus;
}

export interface ScheduleSnapshot {
  fetchedAt: number;
  dtekUpdate: string | null;
  kind: 'fact' | 'preset';
  date: string;
  group: string;
  slots: string[];
  hash: string;
}

/**
 * Local SQLite (Node's built-in `node:sqlite`): the power event log and DTEK schedule
 * snapshots, so data survives restarts and internet drops (PRD N3, N4).
 */
export class Storage implements OnModuleDestroy {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    for (const sql of MIGRATIONS) this.db.exec(sql);
  }

  onModuleDestroy(): void {
    this.db.close();
  }

  // Power events (PRD P5)

  recordPowerEvent(status: GridStatus, at: number): void {
    this.db
      .prepare('INSERT INTO power_events (at, status) VALUES (?, ?)')
      .run(at, status);
  }

  lastPowerEvent(): PowerEvent | null {
    const row = this.db
      .prepare(
        'SELECT at, status FROM power_events ORDER BY at DESC, rowid DESC LIMIT 1',
      )
      .get() as { at: number; status: GridStatus } | undefined;
    return row ?? null;
  }

  /** Events since `from`, plus the last one before it so the first interval is known. */
  powerEventsSince(from: number): PowerEvent[] {
    const before = this.db
      .prepare(
        'SELECT at, status FROM power_events WHERE at < ? ORDER BY at DESC, rowid DESC LIMIT 1',
      )
      .get(from) as PowerEvent | undefined;
    const rows = this.db
      .prepare(
        'SELECT at, status FROM power_events WHERE at >= ? ORDER BY at ASC, rowid ASC',
      )
      .all(from) as unknown as PowerEvent[];
    return before ? [before, ...rows] : rows;
  }

  // Schedule snapshots

  /** Latest snapshot for a date; any group when `group` is null (e.g. offline at boot). */
  latestSnapshot(
    date: string,
    group: string | null,
    kind: ScheduleSnapshot['kind'],
  ): ScheduleSnapshot | null {
    const row = (
      group === null
        ? this.db
            .prepare(
              `SELECT fetched_at, dtek_update, kind, date, grp, slots, hash FROM schedule_snapshots
               WHERE date = ? AND kind = ? ORDER BY id DESC LIMIT 1`,
            )
            .get(date, kind)
        : this.db
            .prepare(
              `SELECT fetched_at, dtek_update, kind, date, grp, slots, hash FROM schedule_snapshots
               WHERE date = ? AND grp = ? AND kind = ? ORDER BY id DESC LIMIT 1`,
            )
            .get(date, group, kind)
    ) as
      | {
          fetched_at: number;
          dtek_update: string | null;
          kind: 'fact' | 'preset';
          date: string;
          grp: string;
          slots: string;
          hash: string;
        }
      | undefined;
    if (!row) return null;
    return {
      fetchedAt: row.fetched_at,
      dtekUpdate: row.dtek_update,
      kind: row.kind,
      date: row.date,
      group: row.grp,
      slots: JSON.parse(row.slots) as string[],
      hash: row.hash,
    };
  }

  /** Saves a snapshot only when it differs from the latest one. Returns true when saved. */
  saveSnapshotIfChanged(snapshot: ScheduleSnapshot): boolean {
    const latest = this.latestSnapshot(
      snapshot.date,
      snapshot.group,
      snapshot.kind,
    );
    if (latest?.hash === snapshot.hash) return false;
    this.db
      .prepare(
        `INSERT INTO schedule_snapshots (fetched_at, dtek_update, kind, date, grp, slots, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        snapshot.fetchedAt,
        snapshot.dtekUpdate,
        snapshot.kind,
        snapshot.date,
        snapshot.group,
        JSON.stringify(snapshot.slots),
        snapshot.hash,
      );
    return true;
  }
}

@Global()
@Module({})
export class StorageModule {
  static forRoot(path: string): DynamicModule {
    const resolved = path === ':memory:' ? path : resolve(process.cwd(), path);
    return {
      module: StorageModule,
      providers: [
        { provide: Storage, useFactory: () => new Storage(resolved) },
      ],
      exports: [Storage],
    };
  }
}
