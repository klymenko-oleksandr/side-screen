import { ConsoleLogger, type LogLevel as NestLogLevel } from '@nestjs/common';
import type { LogLevel } from '@side-screen/shared';
import { type LogBuffer, logBuffer } from './log-buffer';

const LEVEL_MAP: Partial<Record<NestLogLevel, LogLevel>> = {
  log: 'info',
  error: 'error',
  warn: 'warn',
  debug: 'debug',
  fatal: 'error',
};

/** Nest's start-up chatter: still printed to the console, kept out of the dashboard tail. */
const NOISY_CONTEXTS = new Set([
  'InstanceLoader',
  'RoutesResolver',
  'RouterExplorer',
  'NestFactory',
]);

/** Nest's console logger, plus a copy of each line into the dashboard's log tail. */
export class TailLogger extends ConsoleLogger {
  constructor(private readonly buffer: LogBuffer = logBuffer) {
    super('SideScreen', { logLevels: ['log', 'error', 'warn', 'fatal'] });
  }

  protected override printMessages(
    messages: unknown[],
    context = '',
    logLevel: NestLogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
  ): void {
    super.printMessages(messages, context, logLevel, writeStreamType);
    const level = LEVEL_MAP[logLevel];
    if (!level || NOISY_CONTEXTS.has(context)) return;
    for (const message of messages) {
      const text =
        message instanceof Error
          ? message.message
          : typeof message === 'string'
            ? message
            : JSON.stringify(message);
      this.buffer.push(level, context, text);
    }
  }
}
