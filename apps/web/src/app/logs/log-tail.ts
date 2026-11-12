import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { LogLevel, LogLine } from '@side-screen/shared';
import { hhmmss } from '../core/format';

const LEVEL: Record<LogLevel, { tag: string; color: string }> = {
  debug: { tag: 'DBG', color: 'text-dim' },
  info: { tag: 'INFO', color: 'text-info-strong' },
  warn: { tag: 'WARN', color: 'text-warn' },
  error: { tag: 'ERR', color: 'text-bad' },
};

/** Live tail of the Side Screen server's own logs (D4). */
@Component({
  selector: 'ss-log-tail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex min-h-88 flex-col gap-4 overflow-hidden rounded-card border border-line bg-sunken px-14 py-12 font-mono text-log',
  },
  template: `
    <div class="mb-4 flex justify-between font-sans section-label">
      <span>server log</span>
      @if (connected()) {
        <span class="text-ok">live</span>
      } @else {
        <span class="text-warn">reconnecting</span>
      }
    </div>
    <div
      class="fade-top flex min-h-0 flex-1 flex-col justify-end overflow-hidden"
    >
      @for (line of visible(); track line.id) {
        <div class="shrink-0 truncate" data-testid="log-line">
          <span class="text-dim">{{ line.time }}</span>
          <span [class]="line.color"> {{ line.tag }}</span>
          <span class="text-muted"> {{ line.source }}</span>
          {{ line.message }}
        </div>
      }
    </div>
  `,
})
export class LogTail {
  readonly lines = input<LogLine[]>([]);
  readonly count = input(6);
  readonly connected = input(false);
  readonly timeZone = input.required<string>();

  protected readonly visible = computed(() =>
    this.lines()
      .slice(-this.count())
      .map((l) => ({
        id: l.id,
        message: l.message,
        time: hhmmss(l.time, this.timeZone()),
        source: shortContext(l.context),
        ...LEVEL[l.level],
      })),
  );
}

/** `PowerService` → `power` */
function shortContext(context: string): string {
  return context.replace(/(Service|Controller|Module)$/, '').toLowerCase();
}
