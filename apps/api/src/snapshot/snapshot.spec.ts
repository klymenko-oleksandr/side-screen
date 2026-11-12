import type { DashboardEvent } from '@side-screen/shared';
import { parseConfig } from '../config/config.loader';
import { LogBuffer } from '../logging/log-buffer';
import { StreamService } from '../stream/stream.service';
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
