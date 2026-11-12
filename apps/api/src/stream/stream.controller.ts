import { Controller, type MessageEvent, Sse } from '@nestjs/common';
import { concat, defer, from, interval, merge, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { StreamService } from './stream.service';

const KEEPALIVE_MS = 25_000;

@Controller()
export class StreamController {
  constructor(private readonly hub: StreamService) {}

  /** `GET /api/stream`: full state first, then live updates. EventSource reconnects on its own. */
  @Sse('stream')
  stream(): Observable<MessageEvent> {
    const events = concat(
      defer(() => from(this.hub.initialEvents())),
      this.hub.events$,
    ).pipe(
      map((event): MessageEvent => ({ type: event.type, data: event.data })),
    );

    // Keeps idle connections from being dropped; the client ignores `ping`.
    const keepalive = interval(KEEPALIVE_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: '' })),
    );

    return merge(events, keepalive);
  }
}
