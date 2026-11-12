import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { loadConfig, type LoadedConfig } from './config/config.loader';
import { TailLogger } from './logging/tail-logger';

async function bootstrap() {
  const logger = new TailLogger();

  let loaded: LoadedConfig;
  try {
    loaded = loadConfig();
  } catch (err) {
    // Exit non-zero so launchd shows the failure instead of looping on silent defaults.
    logger.fatal((err as Error).message, 'Config');
    process.exit(1);
  }
  if (loaded.usedExample) {
    logger.warn(
      `Using ${loaded.path}; copy it to config/side-screen.config.json to customise`,
      'Config',
    );
  } else {
    logger.log(`Loaded ${loaded.path}`, 'Config');
  }

  const { host, port } = loaded.config.server;
  const app = await NestFactory.create(AppModule.forRoot(loaded.config), {
    logger,
  });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(port, host);

  // Lets `nx serve` know the server is up.
  if (process.env['NX_READY_SIGNAL_SOCKET']) {
    try {
      const load = new Function('s', 'return import(s)') as (
        s: string,
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js isn't installed (e.g. a pruned production install)
    }
  }

  logger.log(
    `Side Screen on http://${host}:${port}${loaded.config.mock ? ' (mock data)' : ''}`,
    'Bootstrap',
  );
}

void bootstrap();
