import { MockPowerSource } from './mock-power.source';

const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m);

describe('MockPowerSource', () => {
  const source = new MockPowerSource();

  it('is ON between cuts, counting down to the 12:00 cut', async () => {
    const data = await source.fetch(at(9, 14));
    expect(data.status).toBe('ON');
    expect(new Date(data.since).getHours()).toBe(4);
    expect(new Date(data.nextCut?.start ?? '').getHours()).toBe(12);
    expect(new Date(data.nextCut?.end ?? '').getHours()).toBe(16);
    expect(data.today.slots).toHaveLength(48);
    expect(data.tomorrow).toBeNull();
    expect(data.device.onAc).toBe(true);
  });

  it('is OFF during a cut, with the battery draining', async () => {
    const data = await source.fetch(at(14, 0));
    expect(data.status).toBe('OFF');
    expect(new Date(data.since).getHours()).toBe(12);
    expect(data.device.onAc).toBe(false);
    expect(data.device.batteryPct).toBeLessThan(100);
    expect(data.signals.find((s) => s.source === 'dtek-live')?.detail).toBe(
      'planned outage until 16:00',
    );
  });

  it('publishes tomorrow in the evening', async () => {
    const data = await source.fetch(at(19, 0));
    expect(data.tomorrow?.slots).toHaveLength(48);
  });
});
