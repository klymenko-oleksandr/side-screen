import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { ModuleMeta } from '@side-screen/shared';
import { hhmm } from '../core/format';

/** "Updated 09:14", or "stale since 09:10" when the source is failing (PRD S2, N3). */
@Component({
  selector: 'ss-freshness',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'font-mono text-label tracking-normal normal-case' },
  template: `
    @if (meta(); as m) {
      @if (m.stale) {
        <span class="text-warn">stale since {{ time() }}</span>
      } @else {
        <span class="text-dim">{{ time() }}</span>
      }
    }
  `,
})
export class Freshness {
  readonly meta = input<ModuleMeta | null | undefined>(null);
  readonly timeZone = input.required<string>();

  protected readonly time = computed(() => {
    const m = this.meta();
    return m ? hhmm(m.updatedAt, this.timeZone()) : '';
  });
}
