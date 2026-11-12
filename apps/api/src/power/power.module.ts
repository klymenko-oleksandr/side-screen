import { Module } from '@nestjs/common';
import { SIDE_SCREEN_CONFIG } from '../config/config.module';
import type { SideScreenConfig } from '../config/config.schema';
import { DtekService } from './dtek/dtek.service';
import { MacSignals } from './mac/mac-signals';
import { MockPowerSource } from './mock-power.source';
import { PowerController } from './power.controller';
import { PowerService } from './power.service';
import { PowerSource } from './power.source';
import { RealPowerSource } from './real-power.source';
import {
  ChargerSignal,
  DtekLiveSignal,
  DtekScheduleSignal,
  POWER_SIGNAL_PROVIDERS,
  type PowerSignalProvider,
} from './signals/signal-providers';

@Module({
  controllers: [PowerController],
  providers: [
    PowerService,
    DtekService,
    MacSignals,
    MockPowerSource,
    RealPowerSource,
    ChargerSignal,
    DtekScheduleSignal,
    DtekLiveSignal,
    // v1 providers (PRD P1d). Add the HP monitor (phase 4), Telegram, LAN probe here later.
    {
      provide: POWER_SIGNAL_PROVIDERS,
      useFactory: (...providers: PowerSignalProvider[]) => providers,
      inject: [DtekScheduleSignal, DtekLiveSignal, ChargerSignal],
    },
    {
      provide: PowerSource,
      useFactory: (
        config: SideScreenConfig,
        real: RealPowerSource,
        mock: MockPowerSource,
      ) => (config.mock ? mock : real),
      inject: [SIDE_SCREEN_CONFIG, RealPowerSource, MockPowerSource],
    },
  ],
  exports: [DtekService],
})
export class PowerModule {}
