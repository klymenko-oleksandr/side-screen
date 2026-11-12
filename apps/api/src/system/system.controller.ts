import { Controller, Get, Inject } from '@nestjs/common';
import type { UiConfig } from '@side-screen/shared';
import { SIDE_SCREEN_CONFIG } from '../config/config.module';
import type { SideScreenConfig } from '../config/config.schema';

@Controller()
export class SystemController {
  private readonly startedAt = Date.now();

  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
  ) {}

  /** Liveness check for launchd debugging and scripts. */
  @Get('health')
  health() {
    return {
      status: 'ok',
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      mock: this.config.mock,
    };
  }

  /** The non-secret part of the config the UI needs. Never add tokens here (PRD N5). */
  @Get('ui-config')
  uiConfig(): UiConfig {
    return {
      timezone: this.config.locale.timezone,
      showFooter: this.config.ui.showFooter,
      logLines: this.config.ui.logLines,
    };
  }
}
