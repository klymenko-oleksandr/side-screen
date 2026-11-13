import {
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ModuleName, SnapshotEvents } from '@side-screen/shared';
import type { Subscription } from 'rxjs';
import type { StreamService } from '../stream/stream.service';
import { type BatterySaver, batterySaver } from './battery-saver';

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
  /** Polls slower on battery (PRD N7). Power overrides this: it must stay fast. */
  protected readonly slowOnBattery: boolean = true;
  protected readonly logger = new Logger(this.constructor.name);
  protected saver: BatterySaver = batterySaver;

  private current: SnapshotEvents[K] | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private lastRunAt = 0;
  private saverSub?: Subscription;
  private inFlight?: Promise<SnapshotEvents[K] | null>;
  private failing = false;
  private lastSummary: string | null = null;

  protected constructor(
    protected readonly source: SnapshotSource<K>,
    private readonly stream: StreamService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Called with every fresh payload, before it is published. */
  protected onData(_data: ModuleData<K>): void {
    // no-op by default
  }

  /** One line describing the data, logged when it changes. Return null to stay quiet. */
  protected summarize(_data: ModuleData<K>): string | null {
    return null;
  }

  onApplicationBootstrap(): void {
    this.tick();
    if (this.slowOnBattery)
      this.saverSub = this.saver.changes$.subscribe(() => this.schedule());
  }

  onModuleDestroy(): void {
    clearTimeout(this.timer);
    this.saverSub?.unsubscribe();
  }

  /** Current polling period, stretched while on battery. */
  get currentIntervalMs(): number {
    return this.intervalMs * (this.slowOnBattery ? this.saver.multiplier : 1);
  }

  private tick(): void {
    this.lastRunAt = Date.now();
    void this.refresh();
    this.schedule();
  }

  /** (Re)arms the next run, counted from the last one, so switching back to AC can run it at once. */
  private schedule(): void {
    clearTimeout(this.timer);
    const delay = Math.max(
      0,
      this.lastRunAt + this.currentIntervalMs - Date.now(),
    );
    this.timer = setTimeout(() => this.tick(), delay);
    this.timer.unref?.();
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
      this.onData(data);
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
