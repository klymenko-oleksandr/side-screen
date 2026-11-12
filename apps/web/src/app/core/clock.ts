import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** A signal holding "now", ticking on the second. Drives the clock, countdown and strip marker. */
@Injectable({ providedIn: 'root' })
export class Clock {
  private readonly _now = signal(new Date());
  readonly now = this._now.asReadonly();

  constructor() {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const date = new Date();
      this._now.set(date);
      timer = setTimeout(tick, 1000 - date.getMilliseconds());
    };
    timer = setTimeout(tick, 1000 - new Date().getMilliseconds());
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }
}
