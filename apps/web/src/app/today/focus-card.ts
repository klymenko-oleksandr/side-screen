import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { TodaySnapshot } from '@side-screen/shared';

/** "Three things" from the Reminders `Now` list (K2). Read-only: Reminders stays the source of truth. */
@Component({
  selector: 'ss-focus-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card flex flex-col gap-8' },
  template: `
    <span class="section-label">Three things</span>
    @for (task of tasks(); track task.id) {
      <div
        class="flex items-center gap-8"
        [class.text-muted]="task.done"
        data-testid="focus-row"
      >
        <span
          class="flex size-16 shrink-0 items-center justify-center rounded-cell border-2"
          [class]="task.done ? 'border-warn bg-warn text-bg' : 'border-dim'"
          aria-hidden="true"
          >{{ task.done ? '✓' : '' }}</span
        >
        <span class="truncate" [class.line-through]="task.done">{{
          task.title
        }}</span>
      </div>
    }
  `,
})
export class FocusCard {
  readonly today = input<TodaySnapshot | null>(null);
  protected readonly tasks = computed(() =>
    (this.today()?.focus ?? []).slice(0, 3),
  );
}
