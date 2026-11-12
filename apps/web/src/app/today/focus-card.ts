import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { TodaySnapshot } from '@side-screen/shared';

/**
 * "Three things" from the Reminders `Now` list (K2). Read-only: Reminders stays the source of truth.
 * Until the Reminders helper exists (phase 5) the items are placeholders, so the card is greyed
 * out and labelled WIP rather than looking like real data.
 */
@Component({
  selector: 'ss-focus-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'card flex flex-col gap-8',
    '[class.wip]': 'wip()',
  },
  styles: `
    :host(.wip) {
      background: repeating-linear-gradient(
        -45deg,
        var(--color-card) 0 12px,
        var(--color-bg) 12px 24px
      );
    }
  `,
  template: `
    <div class="flex items-center justify-between">
      <span class="section-label whitespace-nowrap">Three things</span>
      @if (wip()) {
        <span
          class="rounded-chip border border-line px-4 font-mono text-label text-dim"
          title="Placeholder: these come from the Reminders “Now” list in phase 5"
          data-testid="wip"
          >WIP</span
        >
      }
    </div>
    <div
      class="flex flex-col gap-8"
      [class.opacity-40]="wip()"
      [attr.aria-hidden]="wip() ? 'true' : null"
    >
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
    </div>
  `,
})
export class FocusCard {
  readonly today = input<TodaySnapshot | null>(null);
  protected readonly tasks = computed(() =>
    (this.today()?.focus ?? []).slice(0, 3),
  );
  protected readonly wip = computed(
    () => (this.today()?.focusSource ?? 'mock') === 'mock',
  );
}
