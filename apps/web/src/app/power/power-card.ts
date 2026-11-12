import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  type DaySchedule,
  formatCountdown,
  type GridStatus,
  localDateKey,
  type PowerSnapshot,
  type SlotState,
  slotIndexAt,
} from '@side-screen/shared';
import { hhmm } from '../core/format';
import { Freshness } from '../ui/freshness';

const STATUS_COLOR: Record<GridStatus, string> = {
  ON: 'text-ok',
  OFF: 'text-bad',
  UNCONFIRMED: 'text-warn',
};
const STATUS_DOT: Record<GridStatus, string> = {
  ON: 'bg-ok',
  OFF: 'bg-bad',
  UNCONFIRMED: 'bg-warn',
};
const SLOT_COLOR: Record<SlotState, string> = {
  on: 'bg-slot-on',
  off: 'bg-slot-off',
  maybe: 'bg-slot-maybe',
  unknown: 'bg-slot-unknown',
};

interface StripCell {
  state: SlotState;
  current: boolean;
  label: string;
}

/** Power module: status (P1), next-cut countdown (P2), schedule strip (P3), device row (P4, P5). */
@Component({
  selector: 'ss-power-card',
  imports: [Freshness],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card flex flex-col gap-10' },
  template: `
    @if (power(); as p) {
      <div class="flex gap-10 max-[800px]:flex-col">
        <div class="flex flex-1 flex-col gap-2">
          <div class="flex items-center gap-6 text-meta text-muted">
            <span class="size-8 rounded-full" [class]="dotClass()"></span>
            Power · group {{ p.group }}
            <span class="ml-auto flex items-center gap-6">
              <ss-freshness [meta]="p.meta" [timeZone]="timeZone()" />
              <button
                type="button"
                class="cursor-pointer rounded-chip px-4 text-meta text-dim hover:text-ink"
                title="Refresh now"
                aria-label="Refresh power status"
                (click)="refresh.emit()"
              >
                ↻
              </button>
            </span>
          </div>
          <div class="flex items-baseline gap-8">
            <span
              class="text-display font-bold"
              [class]="statusClass()"
              data-testid="status"
              >{{ p.status }}</span
            >
            <span class="text-meta text-muted">since {{ since() }}</span>
          </div>
        </div>

        @if (cut(); as c) {
          <div
            class="flex flex-1 flex-col gap-2 rounded-tile bg-warn-bg px-12 py-8"
            data-testid="next-cut"
          >
            <span class="text-meta text-warn-soft">{{ c.label }}</span>
            <span class="font-mono text-figure font-semibold text-warn">{{
              c.countdown
            }}</span>
          </div>
        } @else {
          <div
            class="flex flex-1 items-center rounded-tile bg-sunken px-12 py-8 text-meta text-muted"
          >
            No cuts scheduled
          </div>
        }
      </div>

      <div class="flex flex-col gap-4">
        <div
          class="grid h-18 gap-1"
          [style.grid-template-columns]="'repeat(48, minmax(0, 1fr))'"
          data-testid="strip"
        >
          @for (cell of todayCells(); track $index) {
            <div
              class="rounded-cell"
              [class]="cellClass(cell)"
              [class.outline-2]="cell.current"
              [class.outline-warn]="cell.current"
              [title]="cell.label"
            ></div>
          }
        </div>
        @if (tomorrowCells(); as cells) {
          <div class="flex items-center gap-6">
            <span class="w-60 text-label tracking-normal text-dim"
              >Tomorrow</span
            >
            <div
              class="grid h-10 flex-1 gap-1"
              [style.grid-template-columns]="'repeat(48, minmax(0, 1fr))'"
            >
              @for (cell of cells; track $index) {
                <div
                  class="rounded-cell"
                  [class]="cellClass(cell)"
                  [title]="cell.label"
                ></div>
              }
            </div>
          </div>
        }
      </div>

      <div
        class="flex flex-wrap justify-between gap-x-20 gap-y-4 text-meta text-muted"
        data-testid="devices"
      >
        <span
          >MacBook
          <b class="font-semibold text-ink">{{ p.device.batteryPct }}%</b
          >{{ p.device.onAc ? ' ⚡' : '' }}</span
        >
        <span>
          Net
          @if (p.device.internet.online) {
            <b class="font-semibold text-ok"
              >{{ p.device.internet.latencyMs }} ms</b
            >
          } @else {
            <b class="font-semibold text-bad">offline</b>
          }
        </span>
        <span
          >Week off
          <b class="font-semibold text-ink">{{ p.weekOffHours }} h</b></span
        >
      </div>
    } @else {
      <div class="section-label">Power</div>
      <div class="text-meta text-muted">Waiting for the server…</div>
    }
  `,
})
export class PowerCard {
  readonly power = input<PowerSnapshot | null>(null);
  readonly now = input.required<Date>();
  readonly timeZone = input.required<string>();
  readonly refresh = output<void>();

  protected readonly statusClass = computed(
    () => STATUS_COLOR[this.power()?.status ?? 'UNCONFIRMED'],
  );
  protected readonly dotClass = computed(
    () => STATUS_DOT[this.power()?.status ?? 'UNCONFIRMED'],
  );
  protected readonly since = computed(() => {
    const p = this.power();
    return p ? hhmm(p.since, this.timeZone()) : '';
  });

  /** Countdown to the next cut, or to the end of the one in progress. */
  protected readonly cut = computed(() => {
    const window = this.power()?.nextCut;
    if (!window) return null;
    const now = this.now().getTime();
    const start = new Date(window.start).getTime();
    const end = new Date(window.end).getTime();
    const tz = this.timeZone();
    const inProgress = start <= now;
    return {
      label: inProgress
        ? `Cut now · back at ${hhmm(window.end, tz)}`
        : `Next cut ${hhmm(window.start, tz)} – ${hhmm(window.end, tz)}`,
      countdown: formatCountdown((inProgress ? end : start) - now),
    };
  });

  protected readonly todayCells = computed(() =>
    this.cells(this.power()?.today ?? null, true),
  );
  protected readonly tomorrowCells = computed(() => {
    const day = this.power()?.tomorrow;
    return day ? this.cells(day, false) : null;
  });

  protected cellClass(cell: StripCell): string {
    return SLOT_COLOR[cell.state];
  }

  private cells(day: DaySchedule | null, markNow: boolean): StripCell[] {
    if (!day) return [];
    const now = this.now();
    const current =
      markNow && day.date === localDateKey(now) ? slotIndexAt(now) : -1;
    return day.slots.map((state, i) => ({
      state,
      current: i === current,
      label: `${slotTime(i)}–${slotTime(i + 1)} ${state}`,
    }));
  }
}

function slotTime(index: number): string {
  const minutes = index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
