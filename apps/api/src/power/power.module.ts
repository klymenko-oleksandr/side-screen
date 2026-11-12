import { Module } from '@nestjs/common';
import { MockPowerSource } from './mock-power.source';
import { PowerController } from './power.controller';
import { PowerService } from './power.service';
import { PowerSource } from './power.source';

@Module({
  controllers: [PowerController],
  providers: [
    PowerService,
    { provide: PowerSource, useClass: MockPowerSource },
  ],
})
export class PowerModule {}
