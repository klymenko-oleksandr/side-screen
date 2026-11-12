import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { HeaderSnapshot } from '@side-screen/shared';
import { dayMonth, hhmm, weekday } from '../core/format';

@Component({
  selector: 'ss-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-end justify-between' },
  template: `
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-6 text-meta font-medium text-muted">
        {{ weekday() }}
        @if (header()?.meta?.mock) {
          <span
            class="rounded-chip border border-line px-4 text-label tracking-normal text-dim"
            >mock data</span
          >
        }
      </div>
      <div class="text-display font-bold tracking-tight">{{ date() }}</div>
    </div>
    <div class="flex flex-col items-end gap-2">
      <div class="font-mono text-display font-semibold" data-testid="clock">
        {{ time() }}
      </div>
      <div class="text-meta text-muted">{{ weatherLine() }}</div>
    </div>
  `,
})
export class Header {
  readonly header = input<HeaderSnapshot | null>(null);
  readonly now = input.required<Date>();
  readonly timeZone = input.required<string>();

  protected readonly weekday = computed(() =>
    weekday(this.now(), this.timeZone()),
  );
  protected readonly date = computed(() =>
    dayMonth(this.now(), this.timeZone()),
  );
  protected readonly time = computed(() => hhmm(this.now(), this.timeZone()));
  protected readonly weatherLine = computed(() => {
    const h = this.header();
    if (!h) return '';
    return h.weather
      ? `${h.city} ${Math.round(h.weather.tempC)}° · ${h.weather.summary}`
      : h.city;
  });
}
