import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { SideScreenConfig } from './config.schema';

/** Injection token for the validated config. */
export const SIDE_SCREEN_CONFIG = Symbol('SIDE_SCREEN_CONFIG');

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: SideScreenConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: SIDE_SCREEN_CONFIG, useValue: config }],
      exports: [SIDE_SCREEN_CONFIG],
    };
  }
}
