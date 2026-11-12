import type { GridStatus, SignalState } from '@side-screen/shared';

/** One provider's latest report, with the weight its state carries (PRD P1a). */
export interface SignalReading {
  source: string;
  label: string;
  state: SignalState;
  /** ms epoch of when the provider observed this state. */
  observedAt: number;
  weight: number;
  detail?: string;
  /** The schedule is always fresh: it describes now by definition. */
  alwaysFresh?: boolean;
}

export interface AggregatorOptions {
  threshold: number;
  holdMs: number;
  freshMs: number;
}

export interface Verdict {
  status: GridStatus;
  /** ms epoch the current status started. */
  since: number;
  score: number;
  /** Readings that counted (fresh and on/off), with the weight they added. */
  counted: Set<string>;
  /** A different verdict waiting out the hold time, if any. */
  pending: { status: GridStatus; since: number } | null;
}

export function scoreReadings(
  readings: SignalReading[],
  now: number,
  freshMs: number,
) {
  let score = 0;
  const counted = new Set<string>();
  for (const r of readings) {
    if (r.state === 'unknown' || r.weight === 0) continue;
    if (!r.alwaysFresh && now - r.observedAt > freshMs) continue;
    score += r.state === 'on' ? r.weight : -r.weight;
    counted.add(r.source);
  }
  return { score, counted };
}

export function verdictFor(score: number, threshold: number): GridStatus {
  if (score >= threshold) return 'ON';
  if (score <= -threshold) return 'OFF';
  return 'UNCONFIRMED';
}

/**
 * Combines the providers' reports by weighted vote (PRD P1b). A new verdict has to hold
 * for `holdMs` before the status changes, so a flapping signal doesn't flip the screen.
 */
export class PowerAggregator {
  private status: GridStatus | null = null;
  private since = 0;
  private pending: { status: GridStatus; since: number } | null = null;

  constructor(private readonly options: AggregatorOptions) {}

  /** Restores the status and its start after a restart, from the event log. */
  restore(status: GridStatus, since: number): void {
    this.status = status;
    this.since = since;
  }

  update(
    readings: SignalReading[],
    now: number,
  ): Verdict & { changed: boolean } {
    const { score, counted } = scoreReadings(
      readings,
      now,
      this.options.freshMs,
    );
    const verdict = verdictFor(score, this.options.threshold);
    let changed = false;

    if (this.status === null) {
      // First reading after start with nothing restored: take it as is.
      this.status = verdict;
      this.since = now;
      changed = true;
    } else if (verdict === this.status) {
      this.pending = null;
    } else if (this.pending?.status !== verdict) {
      this.pending = { status: verdict, since: now };
    }

    if (this.pending && now - this.pending.since >= this.options.holdMs) {
      this.status = this.pending.status;
      this.since = this.pending.since;
      this.pending = null;
      changed = true;
    }

    return {
      status: this.status,
      since: this.since,
      score,
      counted,
      pending: this.pending,
      changed,
    };
  }
}
