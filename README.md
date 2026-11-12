# Side Screen

A local dashboard for the portrait HP Z24u G3 beside the MacBook. It shows power status, today's plan and dev status at a glance, and comes back on its own after a Kyiv power cut.

- PRD: [Side Screen Dashboard — PRD](https://claude.ai/artifact/Rudp7dvhgV6jNeAwkYBqW9)
- Design: "5 · Mix" artboard on the [design canvas](https://claude.ai/artifact/JawPjSKEPzpyJuGEWgBKRZ)

**Status: Phase 1 (skeleton).** Every module runs on mock data that follows the clock: the status flips to OFF during the mock 12:00–16:00 cut, the countdown ticks, and tomorrow's strip appears after 18:00. Real sources start in Phase 2.

## Stack

| Part                   | Tech                                                                  |
| ---------------------- | --------------------------------------------------------------------- |
| Monorepo               | Nx 24, pnpm                                                           |
| UI (`apps/web`)        | Angular 22: standalone components, signals, zoneless, Tailwind CSS v4 |
| Server (`apps/api`)    | NestJS 11 on `127.0.0.1` only; serves the built UI plus `/api`        |
| Shared (`libs/shared`) | Types for every module and the SSE events, plus schedule helpers      |
| Live updates           | Server-Sent Events (`GET /api/stream`)                                |
| Tests                  | Vitest (web, shared), Jest (api)                                      |

## Getting started

```bash
pnpm install
cp config/side-screen.config.example.json config/side-screen.config.json   # optional in phase 1
pnpm dev            # UI on http://localhost:4200, API on http://127.0.0.1:4300
```

Production-style run (one process serving UI and API):

```bash
pnpm build && pnpm start    # http://127.0.0.1:4300
```

## Run it on the Mac

### 1. Start the server at login (launchd, PRD N2)

```bash
pnpm launchd:install     # builds, installs ~/Library/LaunchAgents/com.klymenko.side-screen.plist, waits for /api/health
pnpm launchd:logs        # tail the server logs
pnpm launchd:restart     # after pulling changes: run `pnpm build` first
pnpm launchd:uninstall
```

The agent runs `node dist/apps/api/main.js` from this folder, restarts it if it crashes, and writes logs to `~/Library/Logs/side-screen/`. It stores the absolute path of the `node` you install with, so re-run `pnpm launchd:install` if you switch Node versions (nvm).

### 2. Add it to the Dock (Safari)

1. Open `http://127.0.0.1:4300` in Safari.
2. **File → Add to Dock…** and keep the name "Side Screen".
3. Open the Side Screen app, drag its window to the HP display, and size it to the full width (1200 px) at the top of the screen.
4. Right-click its Dock icon → **Options → Assign To → This Desktop** (on the HP display's desktop).

**Window height.** At about **1440 px** everything fits on the HP with no scrolling and about 480 px is left for the Reminders widgets. Shorter windows (e.g. 1280 px) scroll. In landscape windows, such as the MacBook screen during a cut, the layout switches to a denser 70% scale; narrow windows stack the cards.

## Configuration (PRD S1)

`config/side-screen.config.json` (git-ignored) holds the outage address, calendar, watched services and repos, aggregator weights and polling intervals. Every field has a default; see [`config/side-screen.config.example.json`](config/side-screen.config.example.json) and the schema in [`apps/api/src/config/config.schema.ts`](apps/api/src/config/config.schema.ts).

- Lookup order: `$SIDE_SCREEN_CONFIG`, then `config/side-screen.config.json`, then the example file (with a warning).
- An invalid file stops the server with a readable error, so launchd logs show what's wrong.
- `server.host` must be a loopback address; the server never listens on the network (PRD N5).
- Secrets don't go in this file. From phase 2, API tokens live in `.env` (git-ignored) or the Keychain.

## How it fits together

```
Safari web app (Angular) ──EventSource──▶ /api/stream ─┐
                         ──fetch───────▶ /api/*        │  NestJS on 127.0.0.1:4300
                                                       │
      HeaderModule  PowerModule  TodayModule  DevModule  FooterModule
           │             │            │           │           │
      HeaderSource  PowerSource  TodaySource  DevSource  FooterSource   ← abstract DI tokens
           │             │            │           │           │
         mock          mock         mock        mock     word list     ← phase 1 bindings
```

- **One Nest module per dashboard module.** Each has an abstract `…Source` class as its DI token, a `SnapshotService` that polls it on the configured interval, and a `GET /api/<module>` endpoint.
- **`SnapshotService`** (`apps/api/src/snapshot/snapshot.ts`) adds `meta` (`updatedAt`, `stale`, `mock`), pushes each snapshot to the stream, and keeps the last good data marked `stale` when a source fails (PRD S2, N3). It logs a one-line summary whenever the data changes.
- **The stream** replays every module's latest snapshot and the recent log lines on connect, so a page reopened after a cut gets full state at once. The UI reconnects on its own if the server restarts.
- **The log tail** (D4) is the server's own Nest log, copied into a ring buffer by `TailLogger`.
- **The UI** has one presentational component per module. `DashboardStore` holds the state as signals; `Clock` ticks every second for the clock, countdown and strip marker.

### Replacing a mock with a real source (phase 2 onwards)

1. Write a class that extends the module's source token, e.g. `class DtekPowerSource extends PowerSource { async fetch(now) { … } }`.
2. Bind it in the module: `{ provide: PowerSource, useClass: DtekPowerSource }`.

The service, endpoint, stream and UI stay as they are. For Power, phase 2 puts the aggregator (P1b) behind `PowerSource`, fed by the individual signal providers (P1a).

## API

| Method | Path                                   | What                                                                                     |
| ------ | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/stream`                          | SSE: `header`, `power`, `today`, `dev`, `footer` snapshots, `log`, `log-backlog`, `ping` |
| GET    | `/api/{header,power,today,dev,footer}` | Latest snapshot of one module                                                            |
| POST   | `/api/power/refresh`                   | Refresh power now (the ↻ button)                                                         |
| GET    | `/api/ui-config`                       | Non-secret UI settings (timezone, footer, log lines)                                     |
| GET    | `/api/health`                          | Liveness check                                                                           |

## Scripts

| Script                                     | What                                                    |
| ------------------------------------------ | ------------------------------------------------------- |
| `pnpm dev`                                 | API and UI in watch mode                                |
| `pnpm build` / `pnpm start`                | Production build / run                                  |
| `pnpm check`                               | Lint, test, typecheck and build everything (same as CI) |
| `pnpm test`, `pnpm lint`, `pnpm typecheck` | One kind of check across all projects                   |
| `pnpm launchd:*`                           | Install, uninstall, restart and tail the launchd agent  |

## Roadmap

- [x] **Phase 1: Skeleton.** Nx monorepo, config file, launchd agent, Mix layout on mock data
- [ ] **Phase 2: Power.** Signal providers and aggregator, DTEK schedule and live status, charger
- [ ] **Phase 3: Today and Dev.** Google Calendar, deploys, Supabase, PRs, stale states from real failures
- [ ] **Phase 4: Resilience.** Hammerspoon window restore and monitor events, offline cache, battery-saving polling
- [ ] **Phase 5: Reminders and extras.** Reminders helper, Ambient mode, word of the hour in the footer
