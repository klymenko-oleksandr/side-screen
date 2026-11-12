import { TestBed } from '@angular/core/testing';
import { scheduleFromOffRanges } from '@side-screen/shared';
import { at, powerSnapshot } from '../testing/fixtures';
import { PowerCard } from './power-card';

// Formatting uses Europe/Kyiv; build the fixture times in the same zone as the test runner.
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

function render(power = powerSnapshot(), now = at(9, 14)) {
  const fixture = TestBed.createComponent(PowerCard);
  fixture.componentRef.setInput('power', power);
  fixture.componentRef.setInput('now', now);
  fixture.componentRef.setInput('timeZone', tz);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** Text of an element, with its child elements separated by a space (as they read on screen). */
function text(el: HTMLElement, id: string): string | undefined {
  const target = el.querySelector(`[data-testid="${id}"]`);
  if (!target) return undefined;
  const parts = target.children.length
    ? [...target.children].map((c) => c.textContent ?? '')
    : [target.textContent ?? ''];
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

describe('PowerCard', () => {
  it('shows the status, since time and countdown to the next cut', () => {
    const el = render();
    expect(text(el, 'status')).toBe('ON');
    expect(el.textContent).toContain('since 05:02');
    expect(text(el, 'next-cut')).toBe('Next cut 12:00 – 16:00 2:46');
  });

  it('counts down to the end of a cut in progress', () => {
    const el = render(powerSnapshot({ status: 'OFF' }), at(13, 30));
    expect(text(el, 'status')).toBe('OFF');
    expect(text(el, 'next-cut')).toBe('Cut now · back at 16:00 2:30');
  });

  it('marks the current half-hour in a 48-cell strip', () => {
    const el = render();
    const cells = el.querySelectorAll('[data-testid="strip"] > div');
    expect(cells).toHaveLength(48);
    expect(cells[18].classList).toContain('outline-warn');
    expect(cells[18].getAttribute('title')).toBe('09:00–09:30 on');
    expect(cells[24].classList).toContain('bg-slot-off');
  });

  it('shows tomorrow once it is published', () => {
    const el = render(
      powerSnapshot({
        tomorrow: scheduleFromOffRanges('2026-11-13', [[8, 12]]),
      }),
    );
    expect(el.textContent).toContain('Tomorrow');
  });

  it('shows the device row and an offline internet state', () => {
    const el = render(
      powerSnapshot({
        device: {
          batteryPct: 87,
          onAc: false,
          internet: { online: false, latencyMs: null },
        },
      }),
    );
    expect(text(el, 'devices')).toBe('MacBook 87% Net offline Week off 41 h');
  });

  it("shows DTEK's reason during a reported outage, and notices", () => {
    const el = render(
      powerSnapshot({
        status: 'OFF',
        outage: {
          reason: 'Стабілізаційне відключення',
          start: at(12).toISOString(),
          end: at(16).toISOString(),
        },
        notice: 'DTEK: timed out',
      }),
      at(13, 30),
    );
    expect(text(el, 'outage-reason')).toBe('Стабілізаційне відключення');
    expect(text(el, 'next-cut')).toContain('back ~16:00');
    expect(text(el, 'power-notice')).toBe('DTEK: timed out');
  });

  it('shows a dash when the battery cannot be read', () => {
    const el = render(
      powerSnapshot({
        device: {
          batteryPct: null,
          onAc: false,
          internet: { online: true, latencyMs: 9 },
        },
      }),
    );
    expect(text(el, 'devices')).toContain('MacBook —');
  });

  it('says when no cut is scheduled', () => {
    expect(render(powerSnapshot({ nextCut: null })).textContent).toContain(
      'No cuts scheduled',
    );
  });
});
