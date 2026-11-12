# Side Screen

Local dashboard for a portrait side monitor. Read `README.md` for the architecture; the PRD is linked there.

- `apps/web`: Angular 22, standalone + signals + zoneless, Tailwind v4. One presentational component per dashboard module; state in `core/dashboard-store.ts`.
- `apps/api`: NestJS 11. One module per dashboard module; each has an abstract `…Source` DI token and a `SnapshotService` subclass, bound to a real or mock source by `config.mock`. Power status comes from signal providers + the aggregator in `apps/api/src/power`.
- `libs/shared`: types and schedule helpers shared by both. Import as `@side-screen/shared`.
- Tailwind spacing is 2px per step (`--spacing: 2px`), so artboard numbers map 1:1: `p-22` is the artboard's 22.
- The server listens on loopback only and never sends secrets to the browser.
- Before committing: `pnpm check`.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
