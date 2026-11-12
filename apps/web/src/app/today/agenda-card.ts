import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { TodaySnapshot } from '@side-screen/shared';
import { hhmm } from '../core/format';
import { Freshness } from '../ui/freshness';

const MAX_ROWS = 5;

/** Today's calendar with cut windows mixed in (T1, T2). Past items drop off; the next event is highlighted. */
@Component({
  selector: 'ss-agenda-card',
  imports: [Freshness],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card flex flex-col gap-8' },
  template: `
    <div class="flex items-center justify-between">
      <span class="section-label">Today</span>
      <ss-freshness [meta]="today()?.meta" [timeZone]="timeZone()" />
    </div>
    @for (row of rows(); track row.id) {
      <div
        class="flex gap-10"
        [class.text-warn-soft]="row.kind === 'cut'"
        data-testid="agenda-row"
      >
        <span
          class="w-40 shrink-0 font-mono"
          [class.text-muted]="row.kind !== 'cut'"
          >{{ row.time }}</span
        >
        <span
          class="truncate"
          [class.font-semibold]="row.next"
          [class.text-info]="row.next"
          >{{ row.title }}</span
        >
      </div>
    } @empty {
      <div class="text-meta text-muted">
        {{ today() ? 'Nothing else today' : 'Waiting for the server…' }}
      </div>
    }
  `,
})
export class AgendaCard {
  readonly today = input<TodaySnapshot | null>(null);
  readonly now = input.required<Date>();
  readonly timeZone = input.required<string>();

  protected readonly rows = computed(() => {
    const items = this.today()?.agenda ?? [];
    const now = this.now().getTime();
    const upcoming = items
      .filter((i) => new Date(i.end).getTime() > now)
      .slice(0, MAX_ROWS);
    const nextEventId = upcoming.find((i) => i.kind === 'event')?.id;
    return upcoming.map((i) => ({
      ...i,
      time: hhmm(i.start, this.timeZone()),
      next: i.id === nextEventId,
    }));
  });
}
