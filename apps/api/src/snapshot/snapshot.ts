import {
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ModuleName, SnapshotEvents } from '@side-screen/shared';
import type { StreamService } from '../stream/stream.service';

/** A module's payload without the freshness metadata the service adds. */
export type ModuleData<K extends ModuleName> = Omit<SnapshotEvents[K], 'meta'>;

/**
 * Where a module gets its data. Each dashboard module declares an abstract subclass
 * as its DI token (e.g. `PowerSource`), and phase 1 binds it to a mock implementation.
 * A real provider later is one new class and one line in the module's `providers`.
 */
export abstract class SnapshotSource<K extends ModuleName> {
  abstract readonly label: string;
  abstract readonly mock: boolean;
  abstract fetch(now: Date): Promise<ModuleData<K>>;
}

/**
 * Polls a source on an interval, caches the latest snapshot, and pushes it over SSE.
 * When the source fails, the last good data stays on screen marked `stale` (PRD S2, N3).
 */
export abstract class SnapshotService<K extends ModuleName>
  implements OnApplicationBootstrap, OnModuleDestroy
{
  protected abstract readonly module: K;
  protected abstract readonly intervalMs: number;
  protected readonly logger = new Logger(this.constructor.name);

  private current: SnapshotEvents[K] | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private inFlight?: Promise<SnapshotEvents[K] | null>;
  private failing = false;
  private lastSummary: string | null = null;

  protected constructor(
    protected readonly source: SnapshotSource<K>,
    private readonly stream: StreamService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** One line describing the data, logged when it changes. Return null to stay quiet. */
  protected summarize(_data: ModuleData<K>): string | null {
    return null;
  }

  onApplicationBootstrap(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  snapshot(): SnapshotEvents[K] | null {
    return this.current;
  }

  /** Fetch now. Concurrent calls share one request. */
  refresh(): Promise<SnapshotEvents[K] | null> {
    this.inFlight ??= this.doRefresh().finally(
      () => (this.inFlight = undefined),
    );
    return this.inFlight;
  }

  private async doRefresh(): Promise<SnapshotEvents[K] | null> {
    const now = this.clock();
    try {
      const data = await this.source.fetch(now);
      if (this.failing) this.logger.log(`${this.source.label} recovered`);
      this.failing = false;
      this.logIfChanged(data);
      this.set({
        ...data,
        meta: {
          updatedAt: now.toISOString(),
          stale: false,
          mock: this.source.mock,
        },
      } as SnapshotEvents[K]);
    } catch (err) {
      if (!this.failing) {
        this.logger.warn(
          `${this.source.label} failed: ${(err as Error).message}; showing last data as stale`,
        );
      }
      this.failing = true;
      if (this.current && !this.current.meta.stale) {
        this.set({
          ...this.current,
          meta: { ...this.current.meta, stale: true },
        });
      }
    }
    return this.current;
  }

  private logIfChanged(data: ModuleData<K>): void {
    const summary = this.summarize(data);
    if (summary !== null && summary !== this.lastSummary)
      this.logger.log(summary);
    this.lastSummary = summary;
  }

  private set(snapshot: SnapshotEvents[K]): void {
    this.current = snapshot;
    this.stream.publish(this.module, snapshot);
  }
}
