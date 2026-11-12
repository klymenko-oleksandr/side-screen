import { Controller, Get, Inject, Injectable, Module } from '@nestjs/common';
import { SIDE_SCREEN_CONFIG } from '../config/config.module';
import type { SideScreenConfig } from '../config/config.schema';
import { type ModuleData, SnapshotService } from '../snapshot/snapshot';
import { StreamService } from '../stream/stream.service';

import { DevSource } from './dev.source';
import { RealDevSource } from './real-dev.source';

export { DevSource };

const BUILD_CYCLE_MS = 2 * 60_000;

@Injectable()
export class MockDevSource extends DevSource {
  readonly label = 'mock dev status';
  readonly mock = true;

  async fetch(now: Date): Promise<ModuleData<'dev'>> {
    // tennis-api "builds" for one of every three 2-minute windows, so the UI and log tail move.
    const building = Math.floor(now.getTime() / BUILD_CYCLE_MS) % 3 === 0;
    const minutesAgo = (m: number) =>
      new Date(now.getTime() - m * 60_000).toISOString();

    return {
      deploys: [
        {
          name: 'klavkogonky',
          provider: 'vercel',
          state: 'ready',
          lastDeployAt: minutesAgo(95),
        },
        {
          name: 'tennis-api',
          provider: 'render',
          state: building ? 'building' : 'ready',
          lastDeployAt: minutesAgo(building ? 0 : 3),
        },
        {
          name: 'tennis-web',
          provider: 'vercel',
          state: 'ready',
          lastDeployAt: minutesAgo(240),
        },
        {
          name: 'tennis-db',
          provider: 'supabase',
          state: 'healthy',
          lastDeployAt: null,
        },
      ],
      pullRequests: [
        {
          repo: 'klavkogonky',
          number: 42,
          title: 'race-engine: ghost replays',
          ci: 'pass',
          url: '#',
        },
        {
          repo: 'klavkogonky',
          number: 41,
          title: 'commentator: prompt v2',
          ci: 'fail',
          url: '#',
        },
      ],
      // D5 (Claude Code progress) is a later phase; the card renders a session once one is reported.
      session: null,
      notices: [],
    };
  }
}

@Injectable()
export class DevService extends SnapshotService<'dev'> {
  protected readonly module = 'dev';
  protected readonly intervalMs: number;

  constructor(
    source: DevSource,
    stream: StreamService,
    @Inject(SIDE_SCREEN_CONFIG) config: SideScreenConfig,
  ) {
    super(source, stream);
    this.intervalMs = config.polling.devSeconds * 1000;
  }

  protected override summarize(data: ModuleData<'dev'>): string {
    const notReady = data.deploys.filter(
      (d) => !['ready', 'healthy', 'paused'].includes(d.state),
    );
    const deploys = notReady.length
      ? notReady.map((d) => `${d.name} ${d.state}`).join(', ')
      : data.deploys.length
        ? 'all deploys ready'
        : 'no deploys';
    const failing = data.pullRequests.filter((p) => p.ci === 'fail').length;
    const notices = data.notices.length ? ` · ${data.notices.join('; ')}` : '';
    return `${deploys} · ${data.pullRequests.length} open PRs, ${failing} failing CI${notices}`;
  }
}

@Controller('dev')
export class DevController {
  constructor(private readonly dev: DevService) {}

  @Get()
  get() {
    return this.dev.snapshot();
  }
}

@Module({
  controllers: [DevController],
  providers: [
    DevService,
    MockDevSource,
    RealDevSource,
    {
      provide: DevSource,
      useFactory: (
        config: SideScreenConfig,
        real: RealDevSource,
        mock: MockDevSource,
      ) => (config.mock ? mock : real),
      inject: [SIDE_SCREEN_CONFIG, RealDevSource, MockDevSource],
    },
  ],
})
export class DevModule {}
