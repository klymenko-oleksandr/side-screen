import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { DtekService } from './dtek/dtek.service';
import { PowerService } from './power.service';
import { RealPowerSource } from './real-power.source';

@Controller('power')
export class PowerController {
  constructor(
    private readonly power: PowerService,
    private readonly dtek: DtekService,
    private readonly real: RealPowerSource,
  ) {}

  @Get()
  get() {
    return this.power.snapshot();
  }

  /** Manual refresh from the Power module's button: reloads DTEK, then recomputes. */
  @Post('refresh')
  @HttpCode(200)
  async refresh() {
    await this.dtek.refreshNow();
    return this.power.refresh();
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
