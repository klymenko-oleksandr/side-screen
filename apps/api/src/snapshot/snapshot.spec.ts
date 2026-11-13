import type { DashboardEvent } from '@side-screen/shared';
import { parseConfig } from '../config/config.loader';
import { LogBuffer } from '../logging/log-buffer';
import { StreamService } from '../stream/stream.service';
import { BatterySaver } from './battery-saver';
import { type ModuleData, SnapshotService, SnapshotSource } from './snapshot';

class FlakySource extends SnapshotSource<'header'> {
  readonly label = 'flaky weather';
  readonly mock = true;
  fail = false;
  calls = 0;

  async fetch(): Promise<ModuleData<'header'>> {
    this.calls++;
    if (this.fail) throw new Error('timeout');
    return { city: 'Kyiv', weather: { tempC: this.calls, summary: 'test' } };
  }
}

class TestService extends SnapshotService<'header'> {
  protected readonly module = 'header';
  protected readonly intervalMs = 60_000;
  constructor(source: FlakySource, stream: StreamService) {
    super(source, stream, () => new Date('2026-11-12T09:14:00Z'));
  }
}

describe('SnapshotService', () => {
  let source: FlakySource;
  let stream: StreamService;
  let service: TestService;
  let published: DashboardEvent[];

  beforeEach(() => {
    source = new FlakySource();
    stream = new StreamService(new LogBuffer(), parseConfig({}));
    service = new TestService(source, stream);
    published = [];
    stream.events$.subscribe((e) => e.type === 'header' && published.push(e));
  });

  it('adds meta and publishes each fresh snapshot', async () => {
    const snap = await service.refresh();
    expect(snap?.weather?.tempC).toBe(1);
    expect(snap?.meta).toEqual({
      updatedAt: '2026-11-12T09:14:00.000Z',
      stale: false,
      mock: true,
    });
    expect(published).toHaveLength(1);
  });

  it('keeps the last good data, marked stale, when the source fails', async () => {
    await service.refresh();
    source.fail = true;
    const snap = await service.refresh();
    expect(snap?.weather?.tempC).toBe(1);
    expect(snap?.meta.stale).toBe(true);

    // A second failure doesn't publish again.
    await service.refresh();
    expect(published).toHaveLength(2);

    source.fail = false;
    expect((await service.refresh())?.meta.stale).toBe(false);
  });

  it('shares one fetch between concurrent refreshes', async () => {
    await Promise.all([
      service.refresh(),
      service.refresh(),
      service.refresh(),
    ]);
    expect(source.calls).toBe(1);
  });

  it('replays the latest snapshot to new clients', async () => {
    await service.refresh();
    const types = stream.initialEvents().map((e) => e.type);
    expect(types).toEqual(['header', 'log-backlog']);
  });
});

describe('battery saving (PRD N7)', () => {
  class CountingSource extends SnapshotSource<'header'> {
    readonly label = 'counter';
    readonly mock = true;
    calls = 0;
    async fetch(): Promise<ModuleData<'header'>> {
      this.calls++;
      return { city: 'Kyiv', weather: null };
    }
  }

  class SlowService extends SnapshotService<'header'> {
    protected readonly module = 'header';
    protected readonly intervalMs = 60_000;
    constructor(
      source: CountingSource,
      stream: StreamService,
      saver: BatterySaver,
    ) {
      super(source, stream);
      this.saver = saver;
    }
  }

  class FastService extends SlowService {
    protected override readonly slowOnBattery = false;
  }

  let saver: BatterySaver;
  let stream: StreamService;

  beforeEach(() => {
    jest.useFakeTimers();
    saver = new BatterySaver();
    saver.configure(4);
    stream = new StreamService(new LogBuffer(), parseConfig({}));
  });

  afterEach(() => jest.useRealTimers());

  it('polls 4× slower on battery and catches up as soon as AC is back', async () => {
    const source = new CountingSource();
    const service = new SlowService(source, stream, saver);
    service.onApplicationBootstrap();
    expect(source.calls).toBe(1);

    saver.update(true);
    expect(service.currentIntervalMs).toBe(240_000);
    await jest.advanceTimersByTimeAsync(180_000);
    expect(source.calls).toBe(1);

    // Plugged back in after 3 min: the run that was due at 1 min happens now.
    saver.update(false);
    await jest.advanceTimersByTimeAsync(0);
    expect(source.calls).toBe(2);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(source.calls).toBe(3);
    service.onModuleDestroy();
  });

  it('leaves modules that opt out (Power) at full speed', async () => {
    const source = new CountingSource();
    const service = new FastService(source, stream, saver);
    service.onApplicationBootstrap();
    saver.update(true);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(source.calls).toBe(3);
    service.onModuleDestroy();
  });

  it('treats an unknown battery state as AC, and factor 1 as off', () => {
    saver.update(null);
    expect(saver.active).toBe(false);
    saver.configure(1);
    saver.update(true);
    expect(saver.multiplier).toBe(1);
  });
});
