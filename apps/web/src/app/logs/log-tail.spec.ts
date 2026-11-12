import { TestBed } from '@angular/core/testing';
import type { LogLine } from '@side-screen/shared';
import { LogTail } from './log-tail';

const line = (id: number, level: LogLine['level'] = 'info'): LogLine => ({
  id,
  time: new Date(2026, 10, 12, 9, 14, id).toISOString(),
  level,
  context: 'PowerService',
  message: `message ${id}`,
});

describe('LogTail', () => {
  it('shows the newest lines only, with level and short context', () => {
    const fixture = TestBed.createComponent(LogTail);
    fixture.componentRef.setInput('lines', [line(1), line(2), line(3, 'warn')]);
    fixture.componentRef.setInput('count', 2);
    fixture.componentRef.setInput(
      'timeZone',
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    fixture.detectChanges();

    const rows = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="log-line"]',
      ),
    ].map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual([
      '09:14:02 INFO power message 2',
      '09:14:03 WARN power message 3',
    ]);
  });

  it('shows the connection state', () => {
    const fixture = TestBed.createComponent(LogTail);
    fixture.componentRef.setInput('timeZone', 'Europe/Kyiv');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'reconnecting',
    );

    fixture.componentRef.setInput('connected', true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'live',
    );
  });
});
