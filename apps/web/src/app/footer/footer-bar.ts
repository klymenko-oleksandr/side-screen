import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { FooterSnapshot } from '@side-screen/shared';

/** LeetCode streak (F2, later) and word of the hour (F1). Hidden in phase 1 (`ui.showFooter`). */
@Component({
  selector: 'ss-footer-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex gap-12' },
  template: `
    <div
      class="flex flex-1 items-center justify-between rounded-tile bg-card px-14 py-10"
    >
      <span class="text-muted">LeetCode streak</span>
      <span class="font-bold">{{ streak() }}</span>
    </div>
    <div
      class="flex flex-1 items-center justify-between rounded-tile bg-card px-14 py-10"
      [title]="footer()?.word?.hint ?? ''"
    >
      <span class="text-muted">Word</span>
      <span class="font-bold">{{ footer()?.word?.term ?? '—' }}</span>
    </div>
  `,
})
export class FooterBar {
  readonly footer = input<FooterSnapshot | null>(null);

  protected readonly streak = computed(() => {
    const days = this.footer()?.leetcodeStreakDays;
    return days === null || days === undefined ? '—' : `${days} d`;
  });
}
