import { Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

/**
 * Battery saving (PRD N7): while the MacBook runs on battery, every module except Power
 * polls `factor` times less often. Power keeps its pace: it is what tells you a cut started.
 *
 * Power feeds it (`update`) on every tick; the other modules' services read `multiplier`
 * and reschedule on `changes$`, so plugging back in brings them back to speed at once.
 */
export class BatterySaver {
  private readonly logger = new Logger('BatterySaver');
  private onBattery = false;
  private factor = 4;
  readonly changes$ = new Subject<boolean>();

  configure(factor: number): void {
    this.factor = Math.max(1, factor);
  }

  /** `onBattery` null = unknown (e.g. pmset unavailable): treated as on AC. */
  update(onBattery: boolean | null): void {
    const next = Boolean(onBattery) && this.factor > 1;
    if (next === this.onBattery) return;
    this.onBattery = next;
    this.logger.log(
      next
        ? `on battery: polling ${this.factor}× slower (power excluded)`
        : 'back on AC: normal polling',
    );
    this.changes$.next(next);
  }

  get active(): boolean {
    return this.onBattery;
  }

  get multiplier(): number {
    return this.onBattery ? this.factor : 1;
  }
}

/** One per process, like the log buffer: services are constructed before any module could share it. */
export const batterySaver = new BatterySaver();
