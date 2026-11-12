export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogLine {
  /** Monotonic id, so the UI can key and de-duplicate lines. */
  id: number;
  /** ISO timestamp. */
  time: string;
  level: LogLevel;
  /** Nest logger context, e.g. `PowerService`. */
  context: string;
  message: string;
}
