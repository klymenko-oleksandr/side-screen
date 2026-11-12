import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { type DynamicModule, Logger, Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule } from '../config/config.module';
import type { SideScreenConfig } from '../config/config.schema';
import { DevModule } from '../dev/dev.module';
import { FooterModule } from '../footer/footer.module';
import { HeaderModule } from '../header/header.module';
import { PowerModule } from '../power/power.module';
import { StreamModule } from '../stream/stream.module';
import { SystemController } from '../system/system.controller';
import { TodayModule } from '../today/today.module';

/** Where the built Angular app lives; override with `SIDE_SCREEN_WEB_DIR`. */
export function webDir(cwd = process.cwd(), env = process.env): string {
  return resolve(cwd, env['SIDE_SCREEN_WEB_DIR'] ?? 'dist/apps/web/browser');
}

@Module({})
export class AppModule {
  static forRoot(
    config: SideScreenConfig,
    opts: { serveWeb?: boolean } = {},
  ): DynamicModule {
    const root = webDir();
    // Always mount the UI, even before it's built: files are read per request, so a
    // build that finishes after the server starts is picked up without a restart.
    const serveWeb = opts.serveWeb ?? true;
    if (serveWeb && !existsSync(resolve(root, 'index.html'))) {
      new Logger('AppModule').warn(
        `No web build at ${root} yet; run "pnpm build" (or use "pnpm dev" on :4200)`,
      );
    }

    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        StreamModule,
        HeaderModule,
        PowerModule,
        TodayModule,
        DevModule,
        FooterModule,
        ...(serveWeb
          ? [
              ServeStaticModule.forRoot({
                rootPath: root,
                exclude: ['/api/{*path}'],
              }),
            ]
          : []),
      ],
      controllers: [SystemController],
    };
  }
}
