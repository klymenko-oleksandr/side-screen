import { TestBed } from '@angular/core/testing';
import type { LogLine } from '@side-screen/shared';
import { powerSnapshot } from '../testing/fixtures';
import {
  DashboardStore,
  EVENT_SOURCE_FACTORY,
  RECONNECT_MS,
} from './dashboard-store';

/** Minimal EventSource stand-in that tests can drive. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, (e: Event) => void>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: Event) => void) {
    this.listeners.set(type, fn);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  emit(type: string, data: unknown) {
    this.listeners.get(type)?.(
      new MessageEvent(type, { data: JSON.stringify(data) }),
    );
  }
}

const log = (id: number): LogLine => ({
  id,
  time: '',
  level: 'info',
  context: 'x',
  message: `m${id}`,
});

describe('DashboardStore', () => {
  let store: DashboardStore;

  beforeEach(() => {
    FakeEventSource.instances = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: EVENT_SOURCE_FACTORY,
          useValue: (url: string) => new FakeEventSource(url),
        },
      ],
    });
    store = TestBed.inject(DashboardStore);
  });

  afterEach(() => vi.useRealTimers());

  it('opens the stream and applies module snapshots', () => {
    store.connect();
    const source = FakeEventSource.instances[0];
    expect(source.url).toBe('/api/stream');

    source.onopen?.();
    expect(store.connected()).toBe(true);

    source.emit('power', powerSnapshot({ status: 'OFF' }));
    expect(store.power()?.status).toBe('OFF');
  });

  it('merges the log backlog with live lines without duplicates', () => {
    store.connect();
    const source = FakeEventSource.instances[0];
    source.emit('log-backlog', [log(1), log(2)]);
    source.emit('log', log(3));
    // A reconnect replays the backlog; nothing should repeat.
    source.emit('log-backlog', [log(2), log(3)]);
    expect(store.logs().map((l) => l.id)).toEqual([1, 2, 3]);
  });

  it('reopens the stream after the browser gives up on it', () => {
    vi.useFakeTimers();
    store.connect();
    const first = FakeEventSource.instances[0];
    first.readyState = 2; // CLOSED
    first.onerror?.();
    expect(store.connected()).toBe(false);

    vi.advanceTimersByTime(RECONNECT_MS);
    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('leaves retrying to the browser while the stream is still connecting', () => {
    vi.useFakeTimers();
    store.connect();
    const first = FakeEventSource.instances[0];
    first.readyState = 0; // CONNECTING
    first.onerror?.();
    vi.advanceTimersByTime(RECONNECT_MS);
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
