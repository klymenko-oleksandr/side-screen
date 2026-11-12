import { Inject, Injectable } from '@nestjs/common';
import {
  type DashboardEvent,
  MODULE_NAMES,
  type ModuleName,
  type SnapshotEvents,
} from '@side-screen/shared';
import { merge, type Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { SIDE_SCREEN_CONFIG } from '../config/config.module';
import type { SideScreenConfig } from '../config/config.schema';
import { LogBuffer } from '../logging/log-buffer';

/**
 * Hub for everything pushed to the dashboard over SSE. Keeps the latest snapshot of
 * each module so a reconnecting client (e.g. after a power cut) gets full state at once.
 */
@Injectable()
export class StreamService {
  private readonly latest = new Map<ModuleName, SnapshotEvents[ModuleName]>();
  private readonly snapshots$ = new Subject<DashboardEvent>();

  constructor(
    private readonly logs: LogBuffer,
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
  ) {}

  publish<K extends ModuleName>(type: K, data: SnapshotEvents[K]): void {
    this.latest.set(type, data);
    this.snapshots$.next({ type, data } as DashboardEvent);
  }

  /** Live events: module snapshots and new log lines. */
  get events$(): Observable<DashboardEvent> {
    return merge(
      this.snapshots$,
      this.logs.lines$.pipe(
        map((line): DashboardEvent => ({ type: 'log', data: line })),
      ),
    );
  }

  /** What a freshly connected client needs before live events. */
  initialEvents(): DashboardEvent[] {
    const events: DashboardEvent[] = [];
    for (const name of MODULE_NAMES) {
      const data = this.latest.get(name);
      if (data) events.push({ type: name, data } as DashboardEvent);
    }
    events.push({
      type: 'log-backlog',
      data: this.logs.recent(Math.max(this.config.ui.logLines, 20)),
    });
    return events;
  }
}
