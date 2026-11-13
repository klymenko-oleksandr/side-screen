# Side Screen

A local dashboard for the portrait HP Z24u G3 beside the MacBook. It shows power status, today's plan and dev status at a glance, and comes back on its own after a Kyiv power cut.

- PRD: [Side Screen Dashboard — PRD](https://claude.ai/artifact/Rudp7dvhgV6jNeAwkYBqW9)
- Design: "5 · Mix" artboard on the [design canvas](https://claude.ai/artifact/JawPjSKEPzpyJuGEWgBKRZ)

**Status: Phase 2 + most of Phase 3.** Power, battery, internet, Week off, the calendar, deploys and PRs read real data. "Three things" is marked WIP until the Reminders helper (phase 5). Set `"mock": true` in the config to run everything on time-driven mock data (handy for UI work).

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
cp config/side-screen.config.example.json config/side-screen.config.json   # set power.address
cp .env.example .env                                                        # tokens, all optional
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

### Secrets (`.env`, git-ignored)

| Key                              | For                  | Where to get it                                                                                                                              |
| -------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CALENDAR_ICS_URL`        | Today (T1)           | Google Calendar → Settings → your calendar → Integrate calendar → _Secret address in iCal format_. Private link; reset it there if it leaks. |
| `VERCEL_TOKEN`, `VERCEL_TEAM_ID` | Deploys (D1)         | vercel.com/account/settings/tokens; team id from Team Settings                                                                               |
| `RENDER_API_KEY`                 | Deploys (D1)         | Render → Account Settings → API Keys                                                                                                         |
| `SUPABASE_ACCESS_TOKEN`          | Database health (D2) | supabase.com/dashboard/account/tokens                                                                                                        |
| `GITHUB_TOKEN`                   | PRs + CI (D3)        | Fine-grained token, _Public repositories (read-only)_                                                                                        |

A missing value only empties its own source and shows a note on the card. With `dev.deploys` empty, every project the tokens can see is listed (up to `dev.maxDeploys`); list them explicitly to pick and rename.

## Data sources

| Signal                   | Source                                                                   | Notes                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grid status (P1)         | Weighted vote of DTEK schedule, DTEK live status and the MacBook charger | Weights, threshold and the 60 s hold live in `power` in the config. Hover the status for each source's vote; `pnpm power:check` prints the full detail. |
| Schedule (P2, P3)        | DTEK Kyiv Grids shutdowns page for `power.address`                       | Page every 6 h, live status every 5 min, ↻ forces both. Changes are stored in SQLite; offline, the last stored schedule is shown.                       |
| Battery, charger (P4)    | `pmset -g batt`                                                          | macOS only                                                                                                                                              |
| Internet (P4)            | `ping` to `power.pingHost` every 15 s                                    |                                                                                                                                                         |
| Week off (P5)            | OFF intervals in the local event log                                     | Counts from the day the server first ran                                                                                                                |
| Calendar (T1, T2)        | Secret iCal URL + DTEK cut windows                                       | Recurring events expanded; all-day events shown as "day"                                                                                                |
| Deploys, DB, PRs (D1–D3) | Vercel, Render, Supabase, GitHub APIs                                    | Every 60 s                                                                                                                                              |

**Why Yasno, not the DTEK page.** The DTEK Kyiv Grids page sits behind bot protection and answers 403 to a server. Yasno (DTEK's retail company) serves the same schedules as plain public JSON. The DTEK client is still there: `power.scheduleSource: "dtek"` or `power.dtekLive: true` turn it back on, and it never tries to get around the protection. `pnpm power:check` shows what each source returned.

## How it fits together

```
Safari web app (Angular) ──EventSource──▶ /api/stream ─┐
                         ──fetch───────▶ /api/*        │  NestJS on 127.0.0.1:4300
                                                       │
      HeaderModule  PowerModule  TodayModule  DevModule  FooterModule
           │             │            │           │           │
      HeaderSource  PowerSource  TodaySource  DevSource  FooterSource   ← abstract DI tokens
           │             │            │           │           │
   placeholder   signals +    iCal +      Vercel,    word list     ← real bindings ("mock": true swaps in mocks)
                 aggregator   DTEK cuts   Render, …
```

- **One Nest module per dashboard module.** Each has an abstract `…Source` class as its DI token, a `SnapshotService` that polls it on the configured interval, and a `GET /api/<module>` endpoint.
- **`SnapshotService`** (`apps/api/src/snapshot/snapshot.ts`) adds `meta` (`updatedAt`, `stale`, `mock`), pushes each snapshot to the stream, and keeps the last good data marked `stale` when a source fails (PRD S2, N3). It logs a one-line summary whenever the data changes.
- **The stream** replays every module's latest snapshot and the recent log lines on connect, so a page reopened after a cut gets full state at once. The UI reconnects on its own if the server restarts.
- **The log tail** (D4) is the server's own Nest log, copied into a ring buffer by `TailLogger`.
- **The UI** has one presentational component per module. `DashboardStore` holds the state as signals; `Clock` ticks every second for the clock, countdown and strip marker.

### Adding a power signal (P1a)

Write a class implementing `PowerSignalProvider` (`apps/api/src/power/signals/signal-providers.ts`) that returns `on` / `off` / `unknown` with a weight, and add it to the `POWER_SIGNAL_PROVIDERS` list in `power.module.ts`. The aggregator and UI don't change. The HP monitor (phase 4), Telegram channels and a LAN probe go here.

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
- [x] **Phase 2: Power.** Signal providers and aggregator, DTEK schedule and live status, charger, battery, ping, Week off
- [x] **Phase 3: Today and Dev (most).** Calendar via secret iCal URL, deploys, Supabase, PRs + CI, stale states. Not yet: Ambient, weather
- [ ] **Phase 4: Resilience.** Hammerspoon window restore and monitor events, offline cache, battery-saving polling
- [ ] **Phase 5: Reminders and extras.** Reminders helper, Ambient mode, word of the hour in the footer
