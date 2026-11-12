import type { LogLevel, LogLine } from '@side-screen/shared';
import { Subject } from 'rxjs';

/**
 * Ring buffer of the server's own log lines (PRD D4). The log tail on the dashboard
 * is fed from here: the backlog on connect, then each new line over SSE.
 */
export class LogBuffer {
  private readonly lines: LogLine[] = [];
  private nextId = 1;
  readonly lines$ = new Subject<LogLine>();

  constructor(private readonly capacity = 200) {}

  push(
    level: LogLevel,
    context: string,
    message: string,
    time = new Date(),
  ): LogLine {
    const line: LogLine = {
      id: this.nextId++,
      time: time.toISOString(),
      level,
      context,
      message,
    };
    this.lines.push(line);
    if (this.lines.length > this.capacity) this.lines.shift();
    this.lines$.next(line);
    return line;
  }

  recent(count: number): LogLine[] {
    return this.lines.slice(-count);
  }
}

/** One buffer per process; the logger writes to it before Nest's DI container exists. */
export const logBuffer = new LogBuffer();
