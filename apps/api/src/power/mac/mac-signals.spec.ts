import { parsePingTime, parsePmset } from './mac-signals';

describe('parsePmset', () => {
  it('reads AC power and charge', () => {
    const out =
      "Now drawing from 'AC Power'\n -InternalBattery-0 (id=4653155)\t100%; charged; 0:00 remaining present: true\n";
    expect(parsePmset(out)).toEqual({ pct: 100, onAc: true });
  });

  it('reads battery power', () => {
    const out =
      "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=4653155)\t87%; discharging; 6:12 remaining present: true\n";
    expect(parsePmset(out)).toEqual({ pct: 87, onAc: false });
  });

  it('returns null for unexpected output', () => {
    expect(parsePmset('pmset: command not found')).toBeNull();
  });
});

describe('parsePingTime', () => {
  it('reads macOS output', () => {
    expect(
      parsePingTime('64 bytes from 1.1.1.1: icmp_seq=0 ttl=57 time=18.412 ms'),
    ).toBe(18);
  });

  it('reads Linux output', () => {
    expect(
      parsePingTime('64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=9.84 ms'),
    ).toBe(10);
  });

  it('returns null on timeout', () => {
    expect(parsePingTime('Request timeout for icmp_seq 0')).toBeNull();
  });
});
