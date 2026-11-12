import {
  PowerAggregator,
  scoreReadings,
  type SignalReading,
  verdictFor,
} from './aggregator';

const NOW = 1_800_000_000_000;
const W = {
  chargerAc: 2,
  chargerBattery: 1,
  dtekLiveOutage: 3,
  dtekLiveClear: 2,
  dtekSchedule: 1,
  monitor: 3,
};

const r = (
  source: string,
  state: SignalReading['state'],
  weight: number,
  extra: Partial<SignalReading> = {},
): SignalReading => ({
  source,
  label: source,
  state,
  weight,
  observedAt: NOW,
  ...extra,
});

const schedule = (on: boolean) =>
  r('dtek-schedule', on ? 'on' : 'off', W.dtekSchedule, { alwaysFresh: true });
const live = (outage: boolean) =>
  r(
    'dtek-live',
    outage ? 'off' : 'on',
    outage ? W.dtekLiveOutage : W.dtekLiveClear,
  );
const charger = (ac: boolean) =>
  r('charger', ac ? 'on' : 'off', ac ? W.chargerAc : W.chargerBattery);

describe('aggregator scoring (PRD situations table)', () => {
  const cases: Array<[string, SignalReading[], number, string]> = [
    [
      'laptop on the sofa, no cut',
      [live(false), schedule(true), charger(false)],
      2,
      'ON',
    ],
    [
      'scheduled cut, DTEK reports it, laptop on battery',
      [live(true), schedule(false), charger(false)],
      -5,
      'OFF',
    ],
    [
      'long cut, laptop charging from the power station',
      [live(true), schedule(false), charger(true)],
      -2,
      'OFF',
    ],
    [
      'emergency cut DTEK reports, schedule says on',
      [live(true), schedule(true), charger(false)],
      -3,
      'OFF',
    ],
    [
      'cut not yet reported by DTEK, schedule says off',
      [live(false), schedule(false), charger(false)],
      0,
      'UNCONFIRMED',
    ],
    [
      'power back early, DTEK still shows the cut, charging',
      [charger(true), live(true), schedule(false)],
      -2,
      'OFF',
    ],
  ];

  it.each(cases)('%s', (_name, readings, score, status) => {
    const result = scoreReadings(readings, NOW, 10 * 60_000);
    expect(result.score).toBe(score);
    expect(verdictFor(result.score, 2)).toBe(status);
  });

  it('charger alone never decides (P1c)', () => {
    const { score } = scoreReadings([charger(false)], NOW, 600_000);
    expect(verdictFor(score, 2)).toBe('UNCONFIRMED');
  });

  it('ignores stale and unknown readings, but the schedule is always fresh', () => {
    const old = NOW - 11 * 60_000;
    const { score, counted } = scoreReadings(
      [
        r('dtek-live', 'off', 3, { observedAt: old }),
        r('x', 'unknown', 5),
        r('dtek-schedule', 'off', 1, { observedAt: old, alwaysFresh: true }),
      ],
      NOW,
      10 * 60_000,
    );
    expect(score).toBe(-1);
    expect([...counted]).toEqual(['dtek-schedule']);
  });
});

describe('PowerAggregator hold time', () => {
  const opts = { threshold: 2, holdMs: 60_000, freshMs: 600_000 };

  it('takes the first verdict immediately', () => {
    const agg = new PowerAggregator(opts);
    const v = agg.update([live(false), schedule(true)], NOW);
    expect(v).toMatchObject({ status: 'ON', since: NOW, changed: true });
  });

  it('changes status only after the new verdict holds for 60 s, dated from when it began', () => {
    const agg = new PowerAggregator(opts);
    agg.update([live(false), schedule(true)], NOW);

    const cut = [live(true), schedule(false), charger(false)];
    expect(agg.update(cut, NOW + 5_000)).toMatchObject({
      status: 'ON',
      pending: { status: 'OFF', since: NOW + 5_000 },
    });
    expect(agg.update(cut, NOW + 30_000).status).toBe('ON');
    expect(agg.update(cut, NOW + 65_000)).toMatchObject({
      status: 'OFF',
      since: NOW + 5_000,
      changed: true,
      pending: null,
    });
  });

  it('drops a pending change that flips back within the hold time', () => {
    const agg = new PowerAggregator(opts);
    agg.update([live(false), schedule(true)], NOW);
    agg.update([live(true), schedule(false)], NOW + 5_000);
    expect(
      agg.update([live(false), schedule(true)], NOW + 20_000),
    ).toMatchObject({ status: 'ON', pending: null });
    expect(
      agg.update([live(false), schedule(true)], NOW + 120_000).changed,
    ).toBe(false);
  });

  it('keeps a restored status across restarts', () => {
    const agg = new PowerAggregator(opts);
    agg.restore('OFF', NOW - 3_600_000);
    const v = agg.update([live(true), schedule(false)], NOW);
    expect(v).toMatchObject({
      status: 'OFF',
      since: NOW - 3_600_000,
      changed: false,
    });
  });
});
