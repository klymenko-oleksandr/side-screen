import type { WithMeta } from './module-meta';

/** Combined grid verdict (PRD P1). */
export type GridStatus = 'ON' | 'OFF' | 'UNCONFIRMED';

/** What a single power signal provider reports (PRD P1a). */
export type SignalState = 'on' | 'off' | 'unknown';

export interface PowerSignal {
  /** Provider id, e.g. `dtek-schedule`, `dtek-live`, `charger`. */
  source: string;
  label: string;
  state: SignalState;
  /** ISO timestamp of when the provider observed this state. */
  observedAt: string;
  detail?: string;
  /** Vote weight this reading carried in the aggregator (0 when it didn't count). */
  weight?: number;
}

/** A cut DTEK reports for the address right now (live status). */
export interface LiveOutage {
  /** DTEK's reason, e.g. "Стабілізаційне відключення". */
  reason: string;
  start: string;
  /** Estimated restore time. */
  end: string;
}

/** One 30-minute slot of the outage schedule. */
export type SlotState = 'on' | 'off' | 'maybe' | 'unknown';

/** A day of schedule: always 48 half-hour slots, slot 0 = 00:00–00:30 local time. */
export interface DaySchedule {
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  slots: SlotState[];
}

export interface TimeWindow {
  /** ISO timestamp. */
  start: string;
  /** ISO timestamp. */
  end: string;
}

export interface DeviceStatus {
  /** Null when the battery can't be read (not macOS, pmset failed). */
  batteryPct: number | null;
  onAc: boolean;
  internet: {
    online: boolean;
    /** Round-trip time in ms, null when offline. */
    latencyMs: number | null;
  };
}

export interface PowerData {
  status: GridStatus;
  /** ISO timestamp of when the current status started. */
  since: string;
  /** DTEK outage group, e.g. `38.1`. */
  group: string;
  signals: PowerSignal[];
  /** Next scheduled cut, or the one in progress. Null when none is scheduled. */
  nextCut: TimeWindow | null;
  today: DaySchedule;
  /** Present once DTEK publishes tomorrow's schedule. */
  tomorrow: DaySchedule | null;
  device: DeviceStatus;
  /** Hours without power over the last 7 days (PRD P5), from the local event log. */
  weekOffHours: number;
  /** The outage DTEK lists for the address now, if any (PRD P2). */
  outage: LiveOutage | null;
  /** Aggregator score: sum of `on` weights minus `off` weights (PRD P1b). */
  score: number;
  /** Something the user should know, e.g. "DTEK unreachable" or "address not set". */
  notice: string | null;
}

export type PowerSnapshot = WithMeta<PowerData>;
