import {
  DestroyRef,
  Injectable,
  InjectionToken,
  inject,
  signal,
  type WritableSignal,
} from '@angular/core';
import {
  type LogLine,
  MODULE_NAMES,
  type ModuleName,
  type RefreshResponse,
  type SnapshotEvents,
  STREAM_PATH,
  type UiConfig,
} from '@side-screen/shared';

/** How long to wait before reopening a stream the browser gave up on (e.g. server restarting). */
export const RECONNECT_MS = 5_000;
const MAX_LOG_LINES = 50;
const REFRESH_MESSAGE_MS = 6_000;
/** `EventSource.CLOSED`, spelled out so the store also loads where EventSource is missing (tests). */
const CLOSED = 2;

export const DEFAULT_UI_CONFIG: UiConfig = {
  timezone: 'Europe/Kyiv',
  showFooter: false,
  logLines: 6,
};

/** Factory for EventSource, swappable in tests. */
export const EVENT_SOURCE_FACTORY = new InjectionToken<
  (url: string) => EventSource
>('EVENT_SOURCE_FACTORY', {
  providedIn: 'root',
  factory: () => (url: string) => new EventSource(url),
});

type ModuleSignals = {
  [K in ModuleName]: WritableSignal<SnapshotEvents[K] | null>;
};

/**
 * Holds the dashboard state, fed by one SSE connection to the local server.
 * After a power cut the server restarts (launchd) and this reconnects on its own;
 * the server replays every module's latest snapshot on connect.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly createSource = inject(EVENT_SOURCE_FACTORY);
  private readonly modules: ModuleSignals = {
    header: signal(null),
    power: signal(null),
    today: signal(null),
    dev: signal(null),
    footer: signal(null),
  };

  readonly header = this.modules.header.asReadonly();
  readonly power = this.modules.power.asReadonly();
  readonly today = this.modules.today.asReadonly();
  readonly dev = this.modules.dev.asReadonly();
  readonly footer = this.modules.footer.asReadonly();

  private readonly _logs = signal<LogLine[]>([]);
  readonly logs = this._logs.asReadonly();

  private readonly _connected = signal(false);
  readonly connected = this._connected.asReadonly();

  private readonly _uiConfig = signal<UiConfig>(DEFAULT_UI_CONFIG);
  readonly uiConfig = this._uiConfig.asReadonly();

  private source?: EventSource;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  connect(url = STREAM_PATH): void {
    this.disconnect();
    const source = this.createSource(url);
    this.source = source;

    source.onopen = () => this._connected.set(true);
    source.onerror = () => {
      this._connected.set(false);
      // The browser retries on its own unless it closed the stream (e.g. an HTTP error).
      if (source.readyState === CLOSED) {
        this.reconnectTimer = setTimeout(() => this.connect(url), RECONNECT_MS);
      }
    };

    for (const name of MODULE_NAMES) {
      source.addEventListener(name, (e) => this.setModule(name, parse(e)));
    }
    source.addEventListener('log', (e) => this.appendLogs([parse<LogLine>(e)]));
    source.addEventListener('log-backlog', (e) =>
      this.appendLogs(parse<LogLine[]>(e)),
    );
  }

  disconnect(): void {
    clearTimeout(this.reconnectTimer);
    this.source?.close();
    this.source = undefined;
    this._connected.set(false);
  }

  async loadUiConfig(): Promise<void> {
    try {
      const res = await fetch('/api/ui-config');
      if (res.ok) this._uiConfig.set(await res.json());
    } catch {
      // Server not up yet; defaults are fine until the next reload.
    }
  }

  /** Forces a power refresh; the result arrives over the stream. */
  private readonly _refreshing = signal(false);
  readonly refreshing = this._refreshing.asReadonly();
  private readonly _refreshMessage = signal<string | null>(null);
  /** Result of the last ↻ press, shown for a few seconds. */
  readonly refreshMessage = this._refreshMessage.asReadonly();
  private messageTimer?: ReturnType<typeof setTimeout>;

  /** The ↻ button: the server fetches the schedule (rate-limited); the new data arrives over the stream. */
  async refreshPower(): Promise<void> {
    if (this._refreshing()) return;
    this._refreshing.set(true);
    let message: string;
    try {
      const res = await fetch('/api/power/refresh', { method: 'POST' });
      const body = (await res.json()) as RefreshResponse;
      message = body.message;
    } catch {
      message = 'Server not reachable';
    } finally {
      this._refreshing.set(false);
    }
    this._refreshMessage.set(message);
    clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(
      () => this._refreshMessage.set(null),
      REFRESH_MESSAGE_MS,
    );
  }

  private setModule<K extends ModuleName>(
    name: K,
    data: SnapshotEvents[K],
  ): void {
    this.modules[name].set(data);
  }

  /** Merges by id, so the backlog replayed on reconnect doesn't duplicate lines. */
  private appendLogs(lines: LogLine[]): void {
    this._logs.update((current) => {
      const seen = new Set(current.map((l) => l.id));
      const merged = [...current, ...lines.filter((l) => !seen.has(l.id))];
      merged.sort((a, b) => a.id - b.id);
      return merged.slice(-MAX_LOG_LINES);
    });
  }
}

function parse<T>(event: Event): T {
  return JSON.parse((event as MessageEvent<string>).data) as T;
}
