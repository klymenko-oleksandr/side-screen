import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { PowerService } from './power.service';

@Controller('power')
export class PowerController {
  constructor(private readonly power: PowerService) {}

  @Get()
  get() {
    return this.power.snapshot();
  }

  /** Manual refresh from the Power module's button (PRD: forces a DTEK fetch). */
  @Post('refresh')
  @HttpCode(200)
  refresh() {
    return this.power.refresh();
  }
}
