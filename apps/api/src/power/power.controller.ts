import { Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import type { RefreshResponse } from '@side-screen/shared';
import { SIDE_SCREEN_CONFIG } from '../config/config.module';
import type { SideScreenConfig } from '../config/config.schema';
import { PowerService } from './power.service';
import { RealPowerSource } from './real-power.source';
import { PowerSchedule } from './schedule/power-schedule';

@Controller('power')
export class PowerController {
  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
    private readonly power: PowerService,
    private readonly schedule: PowerSchedule,
    private readonly real: RealPowerSource,
  ) {}

  @Get()
  get() {
    return this.power.snapshot();
  }

  /**
   * The ↻ button: fetches the schedule now (one small request) and recomputes the status.
   * Rate-limited to once a minute; a press inside that window answers from cache.
   */
  @Post('refresh')
  @HttpCode(200)
  async refresh(): Promise<RefreshResponse> {
    const result = this.config.mock
      ? { refreshed: true, message: 'Mock data', retryInSec: 0 }
      : await this.schedule.refreshNow();
    await this.power.refresh();
    return result;
  }

  /** What each provider reported and how the aggregator voted (PRD P1e). `pnpm power:check` prints it. */
  @Get('debug')
  debug() {
    return (
      this.real.debug() ?? {
        note: 'no real power reading yet (mock mode, or the first tick has not run)',
      }
    );
  }
}
