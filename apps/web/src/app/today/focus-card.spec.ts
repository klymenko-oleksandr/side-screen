import { TestBed } from '@angular/core/testing';
import type { TodaySnapshot } from '@side-screen/shared';
import { FocusCard } from './focus-card';

const today = (focusSource: TodaySnapshot['focusSource']): TodaySnapshot => ({
  agenda: [],
  focus: [{ id: '1', title: 'Ship phase 2', done: false }],
  focusSource,
  notice: null,
  meta: { updatedAt: new Date().toISOString(), stale: false, mock: false },
});

describe('FocusCard', () => {
  it('marks placeholder tasks as work in progress', () => {
    const fixture = TestBed.createComponent(FocusCard);
    fixture.componentRef.setInput('today', today('mock'));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.classList).toContain('wip');
    expect(el.querySelector('[data-testid="wip"]')?.textContent).toContain(
      'WIP',
    );
  });

  it('looks normal once Reminders feeds it', () => {
    const fixture = TestBed.createComponent(FocusCard);
    fixture.componentRef.setInput('today', today('reminders'));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.classList).not.toContain('wip');
    expect(el.querySelector('[data-testid="wip"]')).toBeNull();
  });
});
