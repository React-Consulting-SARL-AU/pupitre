# Pupitre Monorepo — Claude/Codex Guidelines

Source of truth for the monorepo. Also read the guide of the workspace you touch:

- Marketing site: [`apps/site/CLAUDE.md`](./apps/site/CLAUDE.md)
- Platform (console + API + auth): [`apps/web/CLAUDE.md`](./apps/web/CLAUDE.md)
- Desktop app: [`apps/desktop/CLAUDE.md`](./apps/desktop/CLAUDE.md)
- Server agent: [`apps/agent/CLAUDE.md`](./apps/agent/CLAUDE.md)
- Product: [`docs/product/PRODUCT.md`](./docs/product/PRODUCT.md) · design: [`docs/product/DESIGN.md`](./docs/product/DESIGN.md)

Pupitre is **source-available**: the code in this repository is public, under the Apache 2.0 licence with the Commons Clause ([`LICENSE`](./LICENSE), licensor React Consulting SARL AU). It is not open source in the OSI sense: anyone can read, modify and self-host the code, and no one can sell Pupitre or a service that derives its main value from it. The hosted platform is free up to `FREE_SERVERS` servers per organization; beyond that, a licence is required, currently granted by a platform admin (see [decision 0018](./docs/decisions/0018-source-available-and-free.md)). Everything that is committed is public: no secrets, no customer data, no internal notes in the repository. All the code is produced by agents; the project owner specifies, reviews and validates.

## Structure

```txt
apps/site        Astro — pupitre.studio: marketing, public docs, blog, legal, download
apps/web         TanStack Start on Cloudflare Workers — app.pupitre.studio: console, /api/v1 (Elysia), /api/auth (Better Auth)
apps/desktop     Electron — the app: VPS onboarding, service catalogue, projects, terminals, agents
apps/agent       Go — pupitred, the compiled agent installed on the customer's VPS

packages/db      Prisma schema + D1 SQL migrations + generated clients (Bun and Cloudflare)
packages/auth    Better Auth: server configuration, plugins, web and desktop clients
packages/api     Elysia /api/v1 app, Eden client, API/DB test harness
packages/shared  shared contracts: agent protocol, service catalogue, plans, permissions, API errors
packages/design  monochrome CSS tokens + Tailwind preset, shared by site, web and desktop

docs/            product, architecture, contracts, decisions
```

## Commands

Bun only.

```bash
bun install
bun dev                 # site + web
bun run dev:site
bun run dev:web
bun run dev:desktop
bun run build:agent     # go build, all architectures
bun run lint
bun run lint:fix
bun run check:types
bun run test
bun run build
bun run db:generate
bun run db:migrate
bun run db:seed
```

Single-workspace commands: `bun --cwd=<workspace> run <script>`.

## Rules

- **The rules that do not move** (see [`docs/architecture.md`](./docs/architecture.md)): the customer's server is the source of truth for what concerns it; no private key outside the customer's laptop; no inbound connection to the customer's server; nothing readable left on the server, only a binary and configuration files; the app stays usable for seven days without the platform.
- **An update reinstalls nothing.** Any change to the shape of a configuration file — `/etc/pupitre` on the VPS, the app's files on the laptop — comes with a numbered migration in the matching registry, never a "the code will read both shapes". The rules and the procedure are in [`docs/contracts/config-migrations.md`](./docs/contracts/config-migrations.md), and the `config-migrations` skill applies them.
- **Contract first.** Everything that crosses a boundary (app ↔ agent, app ↔ platform, console ↔ API) is typed in `packages/shared` before being implemented on both sides. An agent does not change a contract on the fly: it stops and flags it to the owner.
- **Reuse before creating.** Look for an existing primitive (`components/ui`, `hooks`, `lib`) and extend it through a `variant`/prop rather than duplicating it.
- **The design is enforced** by [`DESIGN.md`](./docs/product/DESIGN.md): monochrome, semantic tokens only, never a hard-coded colour, colour is only for state.
- **No new shared package on the fly.** One is created when two workspaces really share a stable contract.
- **Comments are in English.** Same rule as the rest (last resort, one line, never a banner).
- **Demanding quality, no compromise.** Zero lint/typecheck errors, zero dead code, zero avoidable duplication, error handling only at real boundaries (user input, external API). A fix does not come with out-of-scope cleanup, but the code touched must come out flawless.
- **Configuration externalized by default.** Any value that can vary between environments (URL, key, threshold, flag, delay) goes into an environment variable or into the existing shared configuration (`packages/shared`, `packages/design`) — never hard-coded in application code. That does not create a new shared package (rule above): extend what exists.
- **A file is modified with the editing tools** (`Edit`, `Write`), never with `sed`, a heredoc or an ad hoc script: an edit that silently misses costs more than the tool call saved.
- Outside `components/ui`, exactly one React component per file; sub-components in sibling files.
- Generated artifacts stay out of Git, except `apps/web/src/routeTree.gen.ts` and the Prisma client under `packages/db/src/generated/` (the Cloudflare Builds pipeline needs them before installation).
- **Secrets**: never in the repository. `.env.local` at the root (ignored), Wrangler secrets in production, detection hook before commit.
- **Git — commit/push only on explicit request.** Apply the changes, then stop for review. Never `--force` nor `--no-verify`.
- **`main` is production and is not touched locally.** Work goes on `staging` or on a branch that starts from it; `main` only changes through the `staging` → `main` pull request, always merged with a merge commit — the one a release opens and merges, or one by hand when neither the app nor the agent changes. There is no online staging: everything is tried locally. The hooks refuse commits and pushes on `main` (`scripts/assert-branch-writable.ts`, exception `PUPITRE_ALLOW_MAIN=1`). See [`docs/monorepo.md`](./docs/monorepo.md#branches).
- Before a commit: `bun run lint:fix`. Before a push, the hook runs lint, typecheck and the affected tests.
- Commit messages in English, Conventional Commits: `feat(desktop): inspection screen`.

## Working

1. Read this file, the guide of the workspace you touch, and the relevant contracts in `docs/contracts/`.
2. First write the tests that express the expected behaviour, then the code.
3. Stay within the requested scope and within your workspace. A need discovered elsewhere is flagged to the owner, not settled in passing.
4. Lint, typecheck, tests green, then stop.

## External Configs

Cloudflare Builds, D1, Stripe and the signing certificates live in dashboards, outside the repository: keep [`docs/monorepo.md`](./docs/monorepo.md) in sync with them.
