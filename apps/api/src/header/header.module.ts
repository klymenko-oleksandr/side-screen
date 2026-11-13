import { Controller, Get, Inject, Injectable, Module } from '@nestjs/common';
import { SIDE_SCREEN_CONFIG } from '../config/config.module';
import type { SideScreenConfig } from '../config/config.schema';
import {
  type ModuleData,
  SnapshotService,
  SnapshotSource,
} from '../snapshot/snapshot';
import { StreamService } from '../stream/stream.service';
import { openMeteoUrl, parseOpenMeteo } from './open-meteo';

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

const WEATHER_TIMEOUT_MS = 15_000;

/** Current weather from Open-Meteo for `locale.latitude/longitude`, once an hour by default. */
@Injectable()
export class OpenMeteoHeaderSource extends HeaderSource {
  readonly label = 'weather';
  readonly mock = false;

  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
  ) {
    super();
  }

  async fetch(): Promise<ModuleData<'header'>> {
    const { city, latitude, longitude, timezone } = this.config.locale;
    const res = await fetch(openMeteoUrl(latitude, longitude, timezone), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SideScreen/1.0 (personal dashboard)',
      },
      signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
    return { city, weather: parseOpenMeteo(await res.json()) };
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

  protected override summarize(data: ModuleData<'header'>): string | null {
    return data.weather
      ? `weather ${data.city}: ${Math.round(data.weather.tempC)}° ${data.weather.summary}`
      : null;
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
    OpenMeteoHeaderSource,
    {
      provide: HeaderSource,
      useFactory: (
        config: SideScreenConfig,
        real: OpenMeteoHeaderSource,
        mock: MockHeaderSource,
      ) => (config.mock ? mock : real),
      inject: [SIDE_SCREEN_CONFIG, OpenMeteoHeaderSource, MockHeaderSource],
    },
  ],
})
export class HeaderModule {}
