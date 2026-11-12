import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { CiState, DeployState, DevSnapshot } from '@side-screen/shared';
import { Freshness } from '../ui/freshness';

const DEPLOY: Record<
  DeployState,
  { glyph: string; text: string; color: string }
> = {
  ready: { glyph: '●', text: 'ready', color: 'text-ok' },
  healthy: { glyph: '●', text: 'ok', color: 'text-ok' },
  building: { glyph: '◐', text: 'build', color: 'text-warn' },
  error: { glyph: '✕', text: 'error', color: 'text-bad' },
  paused: { glyph: '◌', text: 'paused', color: 'text-muted' },
  unknown: { glyph: '○', text: '—', color: 'text-muted' },
};

const CI: Record<CiState, { text: string; color: string }> = {
  pass: { text: 'CI ✓', color: 'text-ok' },
  fail: { text: 'CI ✗', color: 'text-bad' },
  pending: { text: 'CI …', color: 'text-warn' },
  none: { text: '—', color: 'text-muted' },
};

/** Deploys (D1), database health (D2), PRs with CI (D3) and the Claude Code session (D5). */
@Component({
  selector: 'ss-dev-card',
  imports: [Freshness],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card flex flex-col gap-8 font-mono text-meta' },
  template: `
    <div class="flex items-center justify-between font-sans">
      <span class="section-label">Deploys &amp; PRs</span>
      <ss-freshness [meta]="dev()?.meta" [timeZone]="timeZone()" />
    </div>
    <div class="grid grid-cols-2 gap-6 max-[640px]:grid-cols-1">
      @for (d of deploys(); track d.name) {
        <div
          class="flex justify-between rounded-chip bg-bg px-10 py-7"
          data-testid="deploy"
        >
          <span class="truncate">{{ d.name }}</span>
          <span [class]="d.color">{{ d.glyph }} {{ d.text }}</span>
        </div>
      }
    </div>
    @for (pr of prs(); track pr.repo + pr.number) {
      <div class="flex justify-between gap-10" data-testid="pr">
        <span class="truncate">#{{ pr.number }} {{ pr.title }}</span>
        <span class="shrink-0" [class]="pr.color">{{ pr.text }}</span>
      </div>
    }
    @if (
      dev() &&
      deploys().length === 0 &&
      prs().length === 0 &&
      !dev()?.notices?.length
    ) {
      <div class="font-sans text-muted">
        Nothing to watch yet: add tokens to .env and repos to the config
      </div>
    }
    @if (dev()?.session; as s) {
      <div class="flex justify-between gap-10">
        <span class="truncate">Claude Code · {{ s.title }}</span>
        @if (s.waitingForInput) {
          <span class="shrink-0 text-warn">waiting for you</span>
        } @else {
          <span class="shrink-0 text-muted">{{ s.done }}/{{ s.total }}</span>
        }
      </div>
    }
    @for (notice of dev()?.notices ?? []; track notice) {
      <div
        class="truncate font-sans text-label tracking-normal text-warn-soft"
        data-testid="dev-notice"
      >
        {{ notice }}
      </div>
    }
  `,
})
export class DevCard {
  readonly dev = input<DevSnapshot | null>(null);
  readonly timeZone = input.required<string>();

  protected readonly deploys = computed(() =>
    (this.dev()?.deploys ?? []).map((d) => ({ ...d, ...DEPLOY[d.state] })),
  );
  protected readonly prs = computed(() =>
    (this.dev()?.pullRequests ?? []).map((p) => ({ ...p, ...CI[p.ci] })),
  );
}
