import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
} from '@angular/core';
import { Clock } from './core/clock';
import { DashboardStore } from './core/dashboard-store';
import { DevCard } from './dev/dev-card';
import { FooterBar } from './footer/footer-bar';
import { Header } from './header/header';
import { LogTail } from './logs/log-tail';
import { PowerCard } from './power/power-card';
import { AgendaCard } from './today/agenda-card';
import { FocusCard } from './today/focus-card';

/**
 * The "5 · Mix" layout. In phase 1 the window covers the top ~1280px of the portrait screen;
 * the Reminders desktop widgets sit below it, so the footer stays hidden.
 */
@Component({
  selector: 'ss-root',
  imports: [
    Header,
    PowerCard,
    AgendaCard,
    FocusCard,
    DevCard,
    LogTail,
    FooterBar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="flex min-h-dvh flex-col gap-12 p-22">
      <ss-header [header]="store.header()" [now]="now()" [timeZone]="tz()" />
      <ss-power-card
        [power]="store.power()"
        [now]="now()"
        [timeZone]="tz()"
        [refreshing]="store.refreshing()"
        [refreshMessage]="store.refreshMessage()"
        (refresh)="store.refreshPower()"
      />
      <div class="flex gap-12 max-[800px]:flex-col">
        <ss-agenda-card
          class="min-w-0 flex-3"
          [today]="store.today()"
          [now]="now()"
          [timeZone]="tz()"
        />
        <ss-focus-card class="min-w-0 flex-2" [today]="store.today()" />
      </div>
      <ss-dev-card [dev]="store.dev()" [timeZone]="tz()" />
      <ss-log-tail
        class="flex-1"
        [lines]="store.logs()"
        [count]="store.uiConfig().logLines"
        [connected]="store.connected()"
        [timeZone]="tz()"
      />
      @if (store.uiConfig().showFooter) {
        <ss-footer-bar [footer]="store.footer()" />
      }
    </main>
  `,
})
export class App implements OnInit {
  protected readonly store = inject(DashboardStore);
  protected readonly now = inject(Clock).now;
  protected readonly tz = computed(() => this.store.uiConfig().timezone);

  ngOnInit(): void {
    void this.store.loadUiConfig();
    this.store.connect();
  }
}
