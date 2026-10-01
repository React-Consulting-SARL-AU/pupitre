# Getting started

How to install the tools, run every part of Pupitre on your machine, and test it end to end. For the rules a contribution follows, read [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## What runs where

| Part | Folder | Runs on | Started by |
| --- | --- | --- | --- |
| Site and public docs | `apps/site` | `http://localhost:4321` | `bun dev` or `bun run dev:site` |
| Console, API (`/api/v1`) and auth (`/api/auth`) | `apps/web` | `http://localhost:3000` | `bun dev` or `bun run dev:web` |
| Desktop app | `apps/desktop` | an Electron window | `bun run dev:desktop` |
| Agent `pupitred` | `apps/agent` | a Linux server (amd64 or arm64) | pushed by the desktop app, or built with `bun run build:agent` |

The desktop app is the product: it inspects a server you rent, hardens it, installs the services you tick, and drives it over SSH. The console is where an account, its organizations and their servers live; the app calls it. The agent runs on the server and does the work.

## Prerequisites

- **macOS or Linux.** Windows works for the desktop app alone; the monorepo scripts assume a POSIX shell.
- **[Bun](https://bun.sh) 1.3.14** — the version pinned in `package.json` (`packageManager`). Bun is the only package manager: never `npm`, `pnpm` or `yarn`.
- **Node.js 22 or later** — Electron's build tooling and Playwright need it.
- **Go 1.26 or later** — for the agent (`apps/agent/go.mod`).
- **Git** and **OpenSSH** — the desktop app uses the system's `ssh`.
- **Docker** (OrbStack, Docker Desktop or the Docker engine) — optional, for the throwaway test server the agent is tried on.

Optional tools, never needed to run the project:

- the **Stripe CLI** — only when you work on billing with `BILLING_MODE=stripe`;
- **cloudflared** — only to let an agent on a remote server reach your local console;
- the **1Password CLI** (`op`) — maintainers only, to fill the shared development secrets.

## Install

```bash
git clone https://github.com/React-Consulting-SARL-AU/pupitre.git
cd pupitre
bun install
```

`bun install` also installs the Git hooks (Husky): lint and secret checks before a commit, lint, typecheck and affected tests before a push, and a refusal to commit or push on `main`.

## Start the site and the console

```bash
bun dev
```

The first step, `bun run dev:prepare`, writes `.env.local` at the root from [`.env.example`](../.env.example) and links it into `apps/web/`. It:

- generates the per-machine secrets (such as `BETTER_AUTH_SECRET`);
- copies the non-secret defaults from `apps/web/wrangler.jsonc` (`BILLING_MODE=off`, …);
- creates the local database — a Cloudflare D1 that miniflare keeps under `apps/web/.wrangler/state` — and applies every migration.

Without 1Password, the shared values stay empty, and what needs them stays off: social sign-in (GitHub, Google), outgoing mail, R2 storage, the agent tunnel. Everything else works. `.env.local` is ignored by Git; never commit it.

Then open:

- the console at <http://localhost:3000>;
- the site at <http://localhost:4321>.

To sign in to the local console, ask for a magic link with any email address: without mail configured, the console prints the message in its terminal output instead of sending it, link included — open that link. Tokens are only printed for a link to `localhost`; any other link is redacted. `bun run db:seed local <your email>` makes that account the owner of the platform's own organization and its administrator, which opens `/dashboard/admin`.

`bun run dev:site` and `bun run dev:web` start one of the two.

## Start the desktop app

With the console running in another terminal:

```bash
bun run dev:desktop
```

A development build talks to the local console (`http://localhost:3000`). It does not need an account: on the sign-in screen, **Continue without an account** opens the app in development mode. To try it against the hosted platform with your own account instead, run `bun run dev:desktop:prod`.

The app keeps its files (servers, keys, SSH configuration) in the `Pupitre Dev` folder of your system's application data, apart from an installed Pupitre.

## Try it on a throwaway server

Never point a development build at a server you care about. The repository ships a disposable Ubuntu 24.04 machine running systemd in a container, reachable over SSH on port 2222:

```bash
cd apps/agent/test/vps
docker compose up -d --build
```

Root opens with the password `pupitre`, like a freshly rented VPS. In the app, add a server at `127.0.0.1`, port `2222`, user `root`, then follow the onboarding: the app installs its key, pushes the agent it embeds, installs the services you tick, and hardens the machine (root is closed, the app then connects as `dev`).

`docker compose down -v && docker compose up -d --build` gives you a brand-new machine. See [`apps/agent/test/vps/README.md`](../apps/agent/test/vps/README.md) for the details and the pitfalls (fail2ban banning your own address after failed attempts, host keys).

The desktop app embeds the agent built under `apps/agent/dist/`; `bun run dev:desktop` builds it first. To build it yourself: `bun run build:agent`, or `bun --cwd=apps/agent run build:dev` for the development build.

## Run the checks

From the root:

```bash
bun run lint            # Biome (Ultracite), content checks, contract freshness, Go lint
bun run lint:fix
bun run check:types
bun run test
bun run build
```

One workspace: `bun --cwd=<workspace> run <script>`, for instance `bun --cwd=packages/api run test`.

Things worth knowing:

- **Site tests run under Vitest:** `bun --cwd=apps/site run test`. Plain `bun test` in `apps/site` fails on Astro components.
- **Agent:** `bun --cwd=apps/agent run test` runs `go test ./...` and `go test -tags dev ./...`. Its lint needs `staticcheck` and `govulncheck`: `bun --cwd=apps/agent run tools:install`, with Go's `bin` folder in your `PATH`.
- **Agent integration tests** run against a reinstallable server, behind the `staging` build tag:

  ```bash
  PUPITRE_STAGING_HOST=root@<address> go test -tags staging ./test/staging/...
  ```

  Without the variable they are skipped. See [`apps/agent/CLAUDE.md`](../apps/agent/CLAUDE.md).
- **End-to-end tests:**
  - console: `bun --cwd=apps/web run test:e2e`, Playwright against a local harness. Run `bunx playwright install chromium` once. If port 3000 is taken, prefix the command with `PUPITRE_E2E_PORT=3300`.
  - desktop: `bun --cwd=apps/desktop run test:e2e`, a hidden Electron window driven by Playwright against a fake agent.
- **Contracts:** after changing a schema in `packages/shared`, run `bun run contracts:export`. It writes the JSON Schema that the Go agent reads, and `bun run lint` fails if you forget.
- **Database:** after changing `packages/db/prisma/schema.prisma`:
  - `bun run db:migrate:new <name>` writes the next SQL migration;
  - `bun run db:generate` regenerates the clients, which are committed;
  - `bun run db:migrate local` applies the migration.

## Where to read next

- [`docs/architecture.md`](./architecture.md) — the rules that never move.
- [`docs/contracts/`](./contracts/) — the app ↔ agent protocol, the platform API, the service catalogue, config migrations, backups.
- [`docs/desktop.md`](./desktop.md) — how the desktop app works inside.
- [`docs/monorepo.md`](./monorepo.md) — tooling, branches and the release chain.
- [`docs/decisions/`](./decisions/) — why things are the way they are.
- [`docs/product/PRODUCT.md`](./product/PRODUCT.md) and [`docs/product/DESIGN.md`](./product/DESIGN.md) — the product, its voice and its design system.
