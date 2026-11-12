import { Controller, Get, Inject, Injectable, Module } from '@nestjs/common';
import { SIDE_SCREEN_CONFIG } from '../config/config.module';
import type { SideScreenConfig } from '../config/config.schema';
import {
  type ModuleData,
  SnapshotService,
  SnapshotSource,
} from '../snapshot/snapshot';
import { StreamService } from '../stream/stream.service';

/** DI token for the header's weather. The clock and date are rendered by the browser. */
export abstract class HeaderSource extends SnapshotSource<'header'> {}

@Injectable()
export class MockHeaderSource extends HeaderSource {
  readonly label = 'mock weather';
  readonly mock = true;

  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
  ) {
    super();
  }

  async fetch(): Promise<ModuleData<'header'>> {
    return {
      city: this.config.locale.city,
      weather: { tempC: 4, summary: 'cloudy' },
    };
  }
}

/** Weather API not picked yet (PRD open question): the header shows the city only. */
@Injectable()
export class PlaceholderHeaderSource extends HeaderSource {
  readonly label = 'header';
  readonly mock = false;

  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
  ) {
    super();
  }

  async fetch(): Promise<ModuleData<'header'>> {
    return { city: this.config.locale.city, weather: null };
  }
}

@Injectable()
export class HeaderService extends SnapshotService<'header'> {
  protected readonly module = 'header';
  protected readonly intervalMs: number;

  constructor(
    source: HeaderSource,
    stream: StreamService,
    @Inject(SIDE_SCREEN_CONFIG) config: SideScreenConfig,
  ) {
    super(source, stream);
    this.intervalMs = config.polling.weatherMinutes * 60_000;
  }
}

@Controller('header')
export class HeaderController {
  constructor(private readonly header: HeaderService) {}

  @Get()
  get() {
    return this.header.snapshot();
  }
}

@Module({
  controllers: [HeaderController],
  providers: [
    HeaderService,
    MockHeaderSource,
    PlaceholderHeaderSource,
    {
      provide: HeaderSource,
      useFactory: (
        config: SideScreenConfig,
        real: PlaceholderHeaderSource,
        mock: MockHeaderSource,
      ) => (config.mock ? mock : real),
      inject: [SIDE_SCREEN_CONFIG, PlaceholderHeaderSource, MockHeaderSource],
    },
  ],
})
export class HeaderModule {}
