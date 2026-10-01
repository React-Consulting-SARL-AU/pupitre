# Architecture

Pupitre is a Bun monorepo. Three surfaces and an agent: the desktop app that drives a server, the compiled agent on that server, the platform that authorizes — for free up to `FREE_SERVERS` servers per organization, by a licence beyond —, and the site that presents. The code of the whole monorepo is public, under Apache 2.0 with the Commons Clause ([decision 0018](./decisions/0018-source-available-and-free.md)); none of the rules below rests on its secrecy. The customer's server is the source of truth for everything that concerns them; the platform knows of it only that it exists.

## Runtimes

| Workspace | Runtime | Responsibility |
| --- | --- | --- |
| `apps/desktop` | Electron 44, React 19, node-pty, system `ssh` | Server onboarding, service catalogue, projects, terminals, agents, account |
| `apps/agent` | Go, static binary, systemd | Probe, install modules, project registry, tmux control, keys, heartbeat, update |
| `apps/web` | TanStack Start on Cloudflare Workers | `app.pupitre.studio` console, mounting of `/api/v1` (Elysia) and `/api/auth` (Better Auth), emails, Workflows |
| `apps/site` | Astro on a Cloudflare Worker with static assets | `pupitre.studio`: marketing, public docs, blog, legal, download |
| `packages/api` | Elysia + Eden | `/api/v1` contract, typed client, API/DB test harness |
| `packages/auth` | Better Auth | `createAuth` and its plugins, web and desktop clients |
| `packages/db` | Prisma 7 + Cloudflare D1 | Schema, SQL migrations, Bun and Cloudflare clients |
| `packages/shared` | TypeScript + Zod | Contracts: agent protocol, catalogue, licence and free servers, permissions, errors |
| `packages/design` | CSS + Tailwind 4 | Shared monochrome tokens |

```
Pupitre Desktop ──── ssh, customer's key ────▶ pupitred (customer's VPS)
       │                                            │
       │ https, bearer                              │ outbound https, server token
       ▼                                            ▼
                 apps/web: console + /api/v1 + /api/auth ── D1, R2 (Stripe dormant)
```

## The rules that do not move

1. **The customer's server is the source of truth** for their projects, their services, their secrets. The app displays what the agent returns. The platform stores no code, no secrets, no content.
2. **No private key outside the customer's laptop.** The app generates its ed25519 keys in its folder, one per device and one per server it installs; only the public halves go up to the platform, which relays them to the agent. And therefore no access without a customer's laptop: the agent places a relayed key only if a device it already holds as trusted has approved it ([decision 0014](./decisions/0014-keys-approved-by-a-device.md)).
3. **No inbound connection to the customer's server**, neither from the platform nor from support. The agent pulls what it needs over outbound HTTPS. The only open port is SSH, for the customer.
4. **Nothing readable is deposited on the server.** A binary, generated systemd units, configuration files. No script.
5. **The app requires a first successful connection, then stays usable without the platform for seven days**: the licence is cached, then the agent goes into restricted mode without breaking anything that is running. Exposure does not depend on it at all: the tunnel is on the customer's Cloudflare account, set up by the app from their laptop, and nothing of the platform is on the path.
6. **The contract before the implementation.** What crosses a boundary is typed in `packages/shared` and documented in `docs/contracts/` before it exists on both sides.
7. **An update reinstalls nothing.** A binary never reads a configuration it has not migrated: each change in the shape of a file in `/etc/pupitre` or of an app file is a numbered migration, replayed in order, backed up beforehand and restored if it refuses. The app chains binary update, migration, then modules; the agent also migrates by itself at startup. See [configuration migrations](./contracts/config-migrations.md).

## Desktop

`apps/desktop` is the existing Electron app, extended. The main process holds a single SSH channel to each server (`ssh -F <app config>`), writes JSON requests one per line to it and reads responses and events ([protocol](./contracts/agent-protocol.md)). Terminals use node-pty and the system `ssh`. The renderer never touches the system: `contextIsolation`, an explicit preload API, validation of project names against the list the agent has just given.

The app's SSH configuration lives in its data folder (`ssh/config`, `keys/<server>` in 0600). The user's `~/.ssh/config` is never rewritten; on their request, the app places a single `Include` line in it pointing to its own file, and removes it the same way, so that `ssh`, editors and coding agents reach its servers by name ([decision 0012](./decisions/0012-ssh-config-include.md)). An existing host can be designated instead.

The account is required. The app asks for a login at first launch, then reads the active organization's licence: free up to `FREE_SERVERS` servers, a licence beyond ([decision 0018](./decisions/0018-source-available-and-free.md)); with a suspended licence, the app enrols no server. Only a development build carries a licence of its own, a mirror of the agent's `dev` tag, and it never leaves the repository.

## Agent

`apps/agent` produces `pupitred`, a static Go binary for `linux/amd64` and `linux/arm64`, installed at `/usr/local/bin/pupitred`, with `/etc/pupitre/` in 0600 root and a systemd unit. It contains the probe, the catalogue's modules, the project registry, tmux control, the app's commands, key synchronization, the heartbeat and its own update.

It also carries the migration registry for its own configuration: `pupitred migrate` on the machine, `agent.migrate` on the protocol.

Two interfaces: the JSON protocol over SSH for the app (one `pupitred serve` process per session, limited, or `pupitred serve --privileged` which sudo opens only with `dev`'s password), and the platform's API over outbound HTTPS for the licence, keys and updates. The `pupitred dev` subcommand — also callable as `dev`, a link to the binary — gives the same commands to a human in an SSH terminal: it goes through the same handlers, with the same refusals. Hardening closes root last, after checking that `dev` accepts a key.

## Platform

`apps/web` combines TanStack Start, React 19, Vite and the Cloudflare plugin. The console's routes live in `src/routes/`; `src/routes/api/auth/$.ts` delegates to `@pupitre/auth/server`. `/api/v1/*` has no TanStack route: the Worker's entry point, `src/worker.ts`, passes it to `@pupitre/api/server` before Start, in development as in production, along with `/internal/*`, the Email Routing `email` handler, the Workflows and the Durable Objects.

Elysia is mounted on `/api/v1` in `packages/api/src/server.ts` and remains the single contract for the console and the desktop app, consumed through Eden Treaty (`@pupitre/api/client`). Integration tests start the same API on a SQLite file built from D1's migrations, through `@pupitre/api/testing`.

Better Auth lives in `packages/auth` with the Prisma adapter: magic link, GitHub, `deviceAuthorization` and `bearer` for the desktop app, `organization` with the `owner`, `admin`, `member` roles, `admin` for support, `openAPI`. Passkeys, `twoFactor` and `sso` are added without a migration. A personal organization is created at sign-up: everything belongs to an organization.

Prisma 7 on the Cloudflare D1 adapter, one database per environment, bound to the Worker with no address or secret; the Worker uses *smart placement*, running next to its database. Cloudflare Workflows carry the long tasks (seat reconciliation, deferred decommissioning), R2 the agent's signed binaries, Cloudflare Email the transactional emails. Stripe Managed Payments collects payments as Merchant of Record through Checkout and Payment Links only.

## Site

`apps/site` is a static Astro app deployed on a Cloudflare Worker with static assets: home, pricing, integrations, public docs in MDX, blog, legal, a download page reading the releases, `llms.txt`. English by default, French under `/fr`. Same tokens as the console.

## Boundaries

- `apps/*` never imports another `apps/*`.
- `@pupitre/api/lib/*` is importable only inside `packages/api`; apps go through `./server`, `./client`, `./testing`.
- The Prisma Node entries (`@pupitre/db/client`) are forbidden in code that ships to Workers; the `@pupitre/db/cloudflare/*` variants substitute for them.
- `apps/agent` depends on no TypeScript package; it consumes the JSON Schema exported from `packages/shared`.
- `scripts/assert-package-boundaries.ts` checks all of this at lint time.

## Environment

The web's public variables are `VITE_*`; secrets are runtime variables or Wrangler secrets. `.env.local` at the root is the single source of local secrets; `.env.example` lists their names, aligned with `apps/web/wrangler.jsonc`. The desktop app has no secret: token through `safeStorage`, keys in its data folder.

## Deployment

`apps/web`: a single Wrangler environment online, `production`, deployed by Cloudflare Builds on a push to `main` — `build:production` (D1 migrations then build) then `deploy:production` (check of the required secrets then `wrangler deploy --keep-vars`). There is no online staging: everything is tried locally. `main` changes only through the `staging` → `main` pull request, merged by a merge commit: the one that a release's last job opens and merges once the app and the agent are published, or one opened by hand when neither the app nor the agent changes. Runbook in [deploy.md](./deploy.md), exact names in [monorepo.md](./monorepo.md). `apps/site`: a Worker with static assets, Cloudflare Builds on the same push to `main`. `apps/desktop`: GitHub Actions per tag, signed and notarized builds, publication to a public R2 bucket — `dl.pupitre.studio` — and declaration to the platform, which serves the site's download page. `apps/agent`: the same tag, `go build -trimpath` with no obfuscation — the code is public —, signing, publication to the private R2 bucket through the platform's API.
