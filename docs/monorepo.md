# Monorepo

Same tooling as React-Box, same versions when they are compatible: what was verified there does not have to be verified twice.

## Tooling

| Tool | Role | Note |
| --- | --- | --- |
| Bun 1.3 | package manager, script runtime, `bun test` | Bun only, never npm or pnpm. `packageManager` pinned in `package.json` |
| Turbo 2 | task graph, cache, `--affected` | strict `envMode`: a variable not declared in `globalPassThroughEnv` reaches no task |
| Biome via Ultracite | lint and format | the root `biome.jsonc` extends `ultracite/biome/core`, `semicolons: "asNeeded"`. Same pin as React-Box (`7.8.3`) until the upgrade has been done there |
| tsgo | typecheck | `@typescript/native-preview`, TypeScript 6 |
| Husky + commitlint | hooks | pre-commit: `ultracite fix` per workspace on the staged files, and only a fully staged file is re-staged after the pass — a partially staged file is formatted on disk without its left-aside pieces entering the commit; pre-push: lint, `check:types`, affected `test`, which `SKIP_PREPUSH=1` skips when you know what you are doing; conventional commits |
| Prisma 7 | schema and migrations | generated client committed, fingerprint `packages/db/src/generated/.prisma-inputs.sha256` verified at lint by `scripts/check-prisma-client-freshness.ts`; `db:migrate production`, `db:reset production` and `db:seed production` require `PUPITRE_ALLOW_MIGRATE_ON=production` on the command line |
| Wrangler 4 | Workers, R2, secrets | `secrets.required` declared in `wrangler.jsonc`, verified before deployment |
| Go 1.26+ (`apps/agent/go.mod`) | the agent | `gofmt`, `go vet`, `staticcheck` and `govulncheck` at lint — `go vet` and `staticcheck` a second time with `-tags dev`, so the development build's code compiles too —, `go test` in both variants at tests, `go test -race` by hand; the release compiles with the same `go build -trimpath`, with no obfuscation — the code is public. Both tools are pinned in `apps/agent/package.json`: `bun --cwd=apps/agent run tools:install` installs `staticcheck` and `govulncheck` in Go's bin, to be put in the `PATH`. Go itself is installed by Homebrew on the owner's machine |
| electron-vite, electron-builder | the desktop app | main-process bytecode, fuses, signing and notarization; one runner per system |

## Local development

```bash
bun install
bun dev              # site on :4321, web on :3000, agent tunnel
bun run dev:desktop  # the app, pointed at the local console
bun run dev:desktop:prod  # the app, pointed at app.pupitre.studio: the real account, the real servers
```

`dev:desktop:prod` is the same development app — renderer hot reload, traces, devtools — but directed at the hosted platform by `PUPITRE_PLATFORM_URL`. It then behaves like the installed app: the licence comes from the account, the agent pushed onto a bare server is the release the platform names, and nothing is granted by the build itself. It keeps its data in `Pupitre Dev (app.pupitre.studio)`, next to `Pupitre Dev` (local console) and `Pupitre` (the installed app): a token from one opens nothing at the others, and the three can run at the same time. At first launch you sign in through the device flow with your account, which registers one more device — its key is pushed onto the account's servers at their next beat — and the fleet flow opens the already enrolled servers without reinstalling anything. This is how a screen is tried on a real VPS without a release; what is not tried there is a protocol change: the agent on the other side is the last release's. The `PUPITRE_DEV_*` prefills apply only to the local console.

`dev:desktop` and the desktop's `build` build the agent first (`@pupitre/agent#build`, which turbo never caches: the binary embeds `git describe`, which turbo does not hash, and a build taken from the cache would carry another commit's version): the app embeds `apps/agent/dist` at startup, and it is this binary that it pushes onto a bare server. Without this dependency, it pushed the last manual build, and a screen could wait for a contract the installed agent did not yet speak.

`bun run dev:web` launches Vite and TanStack Start under the Cloudflare plugin, with the local bindings — D1 included, a SQLite file that miniflare keeps under `apps/web/.wrangler/state` and that `dev:prepare` migrates. The agent is tested on a reinstallable VPS, never on the owner's machine: `PUPITRE_STAGING_HOST=root@<address> go test -tags staging ./test/staging/...` from `apps/agent`. Without the variable, these tests are skipped.

### Running a workflow by hand

The six workflows start from Cron Triggers, which fire only on a deployed Worker: locally, nothing ever calls them. A revoked row is therefore never decommissioned there, and everything that depends on a deadline stays untestable.

```bash
bun run workflows:run decommission-server
```

The script hits the internal trigger with the secret that `dev:prepare` wrote, and returns the instance identifier. The names are those of `apps/web/src/workflows/registry.ts`, which remains the only list; an unknown name is refused by the Worker.

### Posting an email into the mailbox, locally

Email Routing exists only on the online zone: locally, nothing ever arrives in the platform's mailbox. `POST /internal/email` opens the same path as the Worker's `email` handler, behind the internal triggers' secret.

```bash
curl -X POST http://localhost:3000/internal/email \
  -H "x-pupitre-internal-secret: $INTERNAL_WORKFLOW_SECRET" \
  -H "x-pupitre-envelope-from: camille@exemple.fr" \
  -H "x-pupitre-envelope-to: support@pupitre.studio" \
  -H "content-type: message/rfc822" \
  --data-binary @message.eml
```

The thread is then read in the console, under `/dashboard/admin`. What becomes of the message is in [`contracts/platform-mail.md`](./contracts/platform-mail.md).

### The mailbox's real time, locally

The `InboxRealtime` class is a Durable Object exported by `apps/web/src/worker.ts`, like the workflows; its logic is in `src/realtime/inbox-realtime.ts`. The Cloudflare Vite plugin carries Durable Objects in development: `bun run dev:web` is enough, the instance is unique (`idFromName("platform")`) and miniflare keeps it under `apps/web/.wrangler/state`.

The console opens `GET /api/v1/admin/inbox/events` as a WebSocket; the Worker intercepts this path **before** Elysia — an Elysia router cannot return a `101` — resolves the session, requires membership in the Pupitre organization, then passes the request to the stub. The object keeps nothing: it accepts the socket in hibernation and broadcasts what a write pushes to it on its internal `/publish` path, behind `INTERNAL_WORKFLOW_SECRET`.

Without a socket, the console stays correct: `INBOX_POLL_INTERVAL_MS` (60 s) catches up for a dead socket, and the e2e harness, which has no Worker, works this way.

### The tunnel that makes the local console reachable

A VPS cannot reach `localhost:3000`: that is its own loopback. `bun dev` therefore launches `scripts/dev-tunnel.ts`, a **named** Cloudflare tunnel — the address does not change from one launch to the next, unlike a throwaway tunnel.

The tunnel is managed from the dashboard and runs from its token: the script only does `cloudflared tunnel run`, the token in `TUNNEL_TOKEN`. A token designates a tunnel and nothing else, where `cloudflared tunnel login` tied the whole workstation to a single account — untenable with several projects on several tunnels.

| What exists | Where |
| --- | --- |
| Tunnel `ppt-dev` | Zero Trust → Networks → Tunnels, on the zone's account |
| Public hostname `dev.pupitre.studio`, path `^/api/v1/agent/`, service `http://localhost:3000` | the tunnel's configuration, in this dashboard; the CNAME record is set with it, and every other path answers 404 |
| Tunnel token | `PUPITRE_TUNNEL_TOKEN`, in the workstation's 1Password note, injected by `dev:prepare` |

`apps/web/vite.config.ts` declares this name in `server.allowedHosts`: Vite by default refuses any host it does not know, and without this line the tunnel reaches the console only to be returned a 403. To target another tunnel, `PUPITRE_TUNNEL_TOKEN` and `PUPITRE_TUNNEL_HOSTNAME` are enough.

Without a token the script says so and stops without failing `bun dev` — the tunnel serves only to install an agent on a remote server.

The desktop app follows by itself: `agentPlatformUrl()` replaces a console on this computer with this name before giving it to the agent, the console and the device flow continuing to go through `localhost:3000`. `PUPITRE_AGENT_PLATFORM_URL` designates another platform for the agent alone.

## Checks

```bash
bun run lint          # boundaries, ultracite, gofmt, go vet, staticcheck, govulncheck
bun run check:types   # tsgo per workspace, the root scripts, go build with and without -tags dev
bun run test
bun run build
```

`ci.yml` runs in two ways: on a **pull request** to `staging` or `main`, and **called by `release.yml`** (`workflow_call`) on the tagged commit, before any build. A push to `staging` triggers nothing — minutes are paid for, the pre-push hook has already passed lint, typecheck and affected tests, and the release verifies the commit going to `main` anyway. The workflows run on **Blacksmith** runners (GitHub app installed on the organization, `blacksmith-*` labels), not on GitHub's, whose billing blocked a release; minutes are paid for there too: `ci.yml` fits in a single job, everything on Ubuntu, and only a release — a `v*` tag — occupies a macOS or Windows runner.

| Job | When | What it does |
| --- | --- | --- |
| `quality` | PR to `staging` or `main`; the `ci` job of `release.yml` on the tag | gitleaks on the new commits (the PR's, or `origin/main..HEAD` for a release) with `.gitleaks.toml`, migrations applied to an empty database, lint (including `gofmt`, `go vet`, `staticcheck`, `govulncheck`), typecheck, tests of all workspaces (including `go test`), build excluding desktop |

**What is really enforced, and by whom.** `main` has **no protection on GitHub's side**: as long as the repository is private, the organization on the free plan sees branch protection and rulesets alike answer 403. The code now being public under Apache 2.0 + Commons Clause, these protections become available the day the repository goes public, and are then set on `main`. No check is "required" in GitHub's sense, and nothing prevents a human with write rights from merging a red pull request. What holds:

- **A release publishes nothing without a green CI.** In `release.yml`, the `ci` job calls `ci.yml` on the tagged commit; `agent` depends on it, and everything else — signing, buckets, `stable` declaration, merge — depends on `agent`. A red lint, typecheck, test or gitleaks stops the release before the first signature.
- **The merge into `main` requires the check.** `bun scripts/release/index.ts merge` reads the head commit of the `staging` → `main` pull request, waits up to five minutes for the `Quality` check run (or `CI / Quality`, its name when `release.yml` calls it) on this commit, and refuses to merge if it failed, if it is still running at the deadline, or if it does not exist — which happens when `staging` has moved forward after the tag: those commits have been verified by no one. The merge is done with `--match-head-commit`, so a push that arrived in the meantime makes it fail instead of entering unverified.
- **The release's pull request does not verify itself.** It is opened by `GITHUB_TOKEN`; the `pull_request` run it triggers waits for an approval no one gives, and expires at the merge — a one-second red cross, "workflow file issue" according to `gh run view`, "required approval but was not approved before it expired" in the annotation. It is not a CI failure: the check that counts is the release's `ci` job, on the same commit.
- **A hand-opened pull request** (to `staging`, or `staging` → `main` without a release) runs `ci.yml` normally, but nothing blocks its merge on the server side: it is up to the owner to merge only when green.

What the CI does not do, and is done elsewhere: the Playwright suites of the console and the app (`bun --cwd=apps/web run test:e2e`, `bun --cwd=apps/desktop run test:e2e`) are run on the owner's machine before a pull request; `go test -race` is launched by hand from `apps/agent` when a Go dependency moves; no coverage is measured.

Neither macOS nor Windows has a CI job: the app is built there at release time, `release.yml`, and that is where it is seen. Windows is not proven anyway: the app's SSH model — a multiplexed master session per server, keys and sockets in 0600 — has no equivalent on OpenSSH for Windows; it becomes a task the day Windows is one.

The workflows' actions are pinned by SHA, the version in a comment beside it; they move forward by hand, when decided. There is no Dependabot: its pull requests were followed by no one.

Three workspaces pass `--timeout=60000` to `bun test`: `apps/web`, `apps/desktop` and `packages/api`. Their tests first build the harness's database, a SQLite file onto which all the migrations of `packages/db/migrations` are replayed before the first case: the five seconds that `bun test` grants by default leave no margin for a cold runner.

## Workspace boundaries

`scripts/assert-package-boundaries.ts` refuses: an import between two `apps/*`; an import of `@pupitre/api/lib/*` outside `packages/api`; an import of the Prisma Node entries in `packages/api/src`, `apps/web/src`; an import of `packages/shared` from `apps/agent` other than through the exported JSON Schema.

## Secrets

- Never in the repository. The pre-commit hook (`scripts/assert-no-secrets.ts`) refuses any string resembling an API key, a token or a private key, on the machine where it is installed; gitleaks, a binary pinned by fingerprint, rereads the new commits in CI with `.gitleaks.toml`, which also serves to reread the whole history by hand (`gitleaks git --redact .`). GitHub's *push protection* is not there to catch an oversight: on a private repository, it requires GitHub Secret Protection, which the current plan does not have; on a public repository, it is free and is enabled. A public repository makes every commit readable by all, history included: a secret that has entered it is a secret to rotate, not to erase.
- Local: `bun run dev:prepare` prepares `.env.local` and the links each tool expects. The three development commands call it first, so there is nothing to launch by hand. It never replaces a value already written: a filled-in `.env.local` stays as it is.
- **What is derived is not stored.** The database has no address: it is a binding. `BETTER_AUTH_SECRET` and `INTERNAL_WORKFLOW_SECRET` are drawn at random per workstation, since they need not be shared.
- **What is drawn is not typed.** The secrets one makes oneself — those for each online environment, and the `PUPITRE_PUBLISH_TOKEN` common to the environments' notes and the release's — are drawn and deposited in the 1Password notes by `bun run secrets:draw` (`scripts/draw-secrets.ts`), never by `openssl` and a copy-paste. A field already filled stays as it is; you empty it in 1Password to have it redrawn. A new secret of this family is added to the script's list, not to an instruction.
- **What is not derived comes from 1Password.** `.env.1password.tpl` is the committed template, with `op://` references and no value; the vault and the note of each environment are in `environments.json` — the workstation reads `local`'s — overridable by `OP_VAULT` and `OP_ITEM`. `op inject` fails as a whole if a field is missing, so a key stays **commented out** as long as its field does not exist in the note.
- **Nothing is blocking.** `op` absent, session closed or field missing: the script says so and falls back on what `.env.local` already carries.
- **`secrets.required` in `wrangler.jsonc` does two things at once**, and it is a trap: Cloudflare loads into the local Worker **only** the keys listed there — everything else `.dev.vars` carries is silently ignored — and `wrangler deploy` refuses to go if one of them is missing. There is no "optional" list. A variable that only local development must see is declared **in the root list only**: the `env.production` block carries its own complete list and overrides it entirely. The social sign-in identifiers appear in both lists: the product does without them on screen, but the online console offers them. A secret that appears nowhere never reaches the Worker, whatever is in `.env.local` — the symptom is a feature that believes itself unconfigured while the value is there.
- `STRIPE_WEBHOOK_SECRET` **is derived** locally, like the database: `dev:prepare` reads it through `stripe listen --print-secret`, that is, the secret of the endpoint the CLI holds for this account, and with which `bun run dev:stripe` signs. It differs from the dashboard's and so has no business in 1Password. Without the CLI, or without `stripe login`, the script says so and blocks nothing. In production, it would be required only in `BILLING_MODE=stripe`; in `off`, the webhook refuses everything without verifying anything.
- The development's **non-secret** values (`BETTER_AUTH_URL`, `VITE_APP_URL`, `EMAIL_FROM`, `PUPITRE_DOWNLOADS_URL`, `BILLING_MODE`) are neither in 1Password nor written by hand: they live in `vars` of `apps/web/wrangler.jsonc`, and `dev:prepare` copies them into `.env.local` when they are empty there. Without this copy, `.dev.vars` would mask `vars` key by key and the local Worker would start with an empty `BETTER_AUTH_URL`.
- `.env.local` is written in 0600 and linked as `apps/web/.dev.vars` (which the Worker reads) and `apps/web/.env.local` (which Vite reads): a single value to keep up to date. `.env.example` remains the reference list of names.
- Deployed: Wrangler secrets, one set per environment. `apps/web/wrangler.jsonc` declares `env.<environment>.secrets.required`; `scripts/check-worker-secrets.ts <environment>` compares this list — plus the four `STRIPE_*` when the environment carries `BILLING_MODE=stripe` — with what is bound to the Worker and refuses the deployment, naming what is missing. It also refuses a required secret declared in clear in `vars`.
- The script reads the bound secrets through `wrangler secret list`. `PUPITRE_WORKER_SECRETS` (list of names) or `--bound-from <file|->` replace this read, for tests and for a CI that already has the list.
- Signing: the Developer ID certificate and the notarization key in the release's 1Password note, copied into the repository's secrets by `release secrets` for the runners — never in a repository file nor on a disk.

## Branches

Two long-lived branches, and nothing else that lives longer than a pull request.

| Branch | What it is | What it deploys |
| --- | --- | --- |
| `staging` | the working branch: everything arrives there, directly or through a pull request. It deploys nothing: everything is tried locally, end to end | nothing |
| `main` | production, and nothing else: it changes only through the `staging` → `main` pull request, the one a release opens and merges, or one opened by hand when neither the app nor the agent changes | `app.pupitre.studio`, `pupitre.studio` |

- **`main` is neither committed to nor pushed to locally.** `.husky/pre-commit` and `.husky/pre-push` call `scripts/assert-branch-writable.ts`, which refuses both and says what to do instead. `PUPITRE_ALLOW_MAIN=1` opens the exception, once, knowingly. A local hook protects only whoever installed it, and there is no other safeguard on GitHub's side: on the free plan, `main` has neither branch protection nor a ruleset (see [Checks](#checks)). The only verification enforced by the server is the release's.
- **`main` moves forward by release, or by a pull request when neither the app nor the agent changes.** `release.yml`'s last job opens the `staging` → `main` pull request and merges it, once the version is downloadable and the CI is green on its head commit. A change that touches only the console, the site or the mails does not need a number: `gh pr create --base main --head staging`, `gh pr checks --watch` until green, then `gh pr merge --merge`, and Cloudflare Builds rebuilds both Workers. Nothing prevents merging before green on the server side: it is a discipline, not a rule. A fix to the app or the agent goes out with the next version.
- **The `staging` → `main` pull request is merged by a merge commit.** Neither squash nor rebase: they rewrite commits, and a version's tagged commit would leave `main`'s history — `git describe` would no longer see it, and `next` would count from the wrong tag. The repository allows only `merge` in *Settings* → *General* → *Pull Requests*, and `gh pr merge --merge` asks for it explicitly.
- **Tags belong to no branch.** `git push origin vX.Y.Z` makes them visible everywhere, immediately: a pull request has nothing to "bring back". The only question that matters is whether the tagged commit is reachable from `main`, which the merge commit guarantees and which squash breaks.

## Platform deployment

### The Cloudflare resource prefix

**Every resource created on the Cloudflare account carries the `ppt-` prefix**: Workers, Workflows, R2 buckets, KV, queues. The account hosts several products, each with its own short prefix; without it, a Pupitre resource is distinguished from another project's only by the memory of whoever reads it. The domain name, for its part, does not change: `pupitre.studio` stays what it is.

### The exact names

| What is created | production |
| --- | --- |
| Worker | `ppt-web-production` |
| Domain | `app.pupitre.studio` |
| Wrangler environment | `production` |
| D1 database | `ppt-db-enam` |
| Emails R2 bucket | `ppt-mail`, bound as `MAIL`, private, default jurisdiction; CORS rule from `apps/web/r2-mail-cors.json` (`wrangler r2 bucket cors set`) so that the console reads and deposits attachments through a signed address; the Worker's `R2_*` token reads and writes there |
| Email Routing | catch-all rule on the `pupitre.studio` zone → *Send to a Worker*, `ppt-web-production` |
| Workflows | `ppt-expire-enrollments`, `ppt-decommission-server`, `ppt-reconcile-seats`, `ppt-evaluate-alerts`, `ppt-suspend-expired-grace`, `ppt-purge-deletions` |
| Durable Object | `INBOX_REALTIME`, class `InboxRealtime` (migration `v1`, `new_sqlite_classes`); a single instance, `idFromName("platform")`, which stores nothing and broadcasts the mailbox's real time |
| Durable Object | `RATE_LIMIT`, class `RateLimit` (migration `v2`, `new_sqlite_classes`); eight instances, `idFromName` of the key's hash, which carry the budgets of the API and the authentication routes — without it, each isolate would count alone |
| Trigger | Cloudflare Builds on a push to `main` |
| Stripe | live mode |

A single online environment. There is no staging at Cloudflare: everything is tried locally, end to end — `bun dev` holds the console on a miniflare D1, the development desktop app talks to it through the `dev.pupitre.studio` tunnel, and the agent is tried on a throwaway VPS. The Worker's name is not chosen: Wrangler is in *legacy* environments, it suffixes the root name (`ppt-web`) with the environment's name. The two Cron Triggers, the domain, the bindings — D1 included — and the list of required secrets all come from `apps/web/wrangler.jsonc`: the dashboard declares none of them.

### The order of creation

The steps, in the order in which they hold, are in [`deploy.md`](./deploy.md): zone, D1 databases, buckets, Email Sending, Stripe, first deployment by hand, secrets, Workers Builds projects. The tables above give the names; that document gives the steps.

### What each deployment does

`build:production` migrates the production D1 then builds with `CLOUDFLARE_ENV`, which freezes the environment in `apps/web/dist/server/wrangler.json`: the deployment no longer takes `--env`. `deploy:production` verifies the secrets, then `wrangler deploy --keep-vars`, which attaches the environment's custom domain, Cron Triggers and Workflows.

A rollback is done on the Worker's versions (`bun x wrangler rollback --config apps/web/dist/server/wrangler.json`, or the list of deployments in the dashboard). A Prisma migration, for its part, is not replayed backwards: a migration that breaks is fixed by a following migration.

### Observability

`observability` is enabled (invocation logs, 100% sampling) and `upload_source_maps` is true, so that stacks are readable. It is the platform's only observability: an uncaught exception goes up to the Cloudflare dashboard and to `wrangler tail`, nothing is sent to a third-party service.

## Cloudflare Builds

| Service | Branch | Build command | Deploy command |
| --- | --- | --- | --- |
| web | `main` | `bun install --frozen-lockfile && bun --cwd=apps/web run build:production` | `bun --cwd=apps/web run deploy:production` |
| site | `main` | `bun install --frozen-lockfile && bun --cwd=apps/site run build:production` | `bun --cwd=apps/site run deploy:production` |

Both Workers are connected to the GitHub repository: each push to `main` — that is, each release — rebuilds and deploys them, with no gesture on the workstation. The development desktop app talks to the local console.

### The site, a Worker with static assets

`apps/site/wrangler.jsonc`: `ppt-site` on `pupitre.studio` and `www.pupitre.studio`. The asset layer serves `dist/` and reads `_headers` and `_redirects`; `worker/index.ts` only redirects `www` to the apex, which this layer refuses to write (relative URLs only).

- Security and cache headers in `apps/site/public/_headers`: `HSTS`, `CSP`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and one year of immutable on `/_astro/*` and `/og/*`.
- Build variables: `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` in production only — without a key, the site loads no analytics and shows no consent banner.
- The legal guard (`apps/site/scripts/legal.ts`) fails the production build — `PUPITRE_ENV=production`, set by `build:production` — and `check:content` when a page in `src/content/legal/` carries a `TODO`, a `draft: true` or a bracketed passage to complete. See [`legal.md`](./legal.md).
- The app's release list is read at build time from `PUBLIC_RELEASES_URL`, set by `build:production` on the console — a public route, with no session: these are public files. An unreachable API does not fail the build: the download page goes out with `apps/site/src/content/site/releases.ts` and a build warning. Locally and in tests, the variable is not set, so the build never goes out on the network.

## Stripe

A single account, Managed Payments enabled and terms accepted on [Managed Payments](https://dashboard.stripe.com/settings/managed-payments): Stripe is the seller, it calculates and remits the tax, handles fraud, disputes, receipts and transactional support. See [`decisions/0007`](./decisions/0007-stripe-managed-payments.md).

One product and two prices, created identically in sandbox and in live:

| | |
| --- | --- |
| Product | a licence seat beyond the free servers, tax code `txcd_10103001` (SaaS, business use) |
| Monthly price | to be decided, `tax_behavior` `exclusive` → `STRIPE_PRICE_SERVER_MONTH` |
| Annual price | to be decided → `STRIPE_PRICE_SERVER_YEAR` |

**Stripe is dormant.** The Worker runs with `BILLING_MODE=off`, a `vars` entry in `apps/web/wrangler.jsonc` ([decision 0018](./decisions/0018-source-available-and-free.md)): Pupitre is free up to `FREE_SERVERS` servers per organization, licences beyond are granted from the admin console (`granted` product), no call to Stripe goes out, and the four `STRIPE_*` secrets are not required — `check:secrets` requires them only of an environment in `stripe`. Switching to `stripe` means creating the account, the prices and the webhook above, setting the four secrets, then changing the variable. Nothing of this dashboard exists today on the live side.

Dashboard settings: support email up to date in [Business details](https://dashboard.stripe.com/settings/business-details) (Stripe escalates there, and without an answer within 48 h it refunds); logo, terms and privacy in [Checkout settings](https://dashboard.stripe.com/settings/checkout); customer portal limited to the payment method, invoices and cancellation, never to the quantity: seats are changed from the console through `POST /orgs/:id/seats`, and `ReconcileSeats` only reports the gap with the number of servers.

Webhook `https://app.pupitre.studio/api/v1/webhooks/stripe`, one endpoint and one secret per mode, on the five events of `HANDLED_EVENT_TYPES`: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Locally, `stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe`.

## Desktop app distribution

### The exact names

| What is created | Where | Exact name |
| --- | --- | --- |
| App identifier | `apps/desktop/electron-builder.yml` | `dev.pupitre.app` |
| Trigger | `scripts/release.sh`, on the owner's Mac | the next version and its notes, then a `v*` tag set on `staging`, which `.github/workflows/release.yml` builds, publishes and merges into `main` |
| Public bucket | Cloudflare R2 | `ppt-downloads`, public domain `dl.pupitre.studio` |
| Private bucket | Cloudflare R2 | `ppt-agent`, the agent's binaries, never public |
| macOS artifacts | `dl.pupitre.studio/app/<version>/` | `Pupitre-<version>-arm64.dmg`, `Pupitre-<version>-x64.dmg`; alongside, `Pupitre-<version>-<arch>.zip`, what `electron-updater` downloads — never an `AppRelease` row |
| Windows artifacts | `dl.pupitre.studio/app/<version>/` | `Pupitre-Setup-<version>-x64.exe` |
| Linux artifacts | `dl.pupitre.studio/app/<version>/` | `Pupitre-<version>-x86_64.AppImage`, `pupitre_<version>_amd64.deb` |
| Update feeds | `dl.pupitre.studio/app/<channel>/` | `latest.yml`, `latest-mac.yml`, `latest-linux.yml` |
| macOS certificate | Apple Developer | `Developer ID Application: <Moroccan company> (<Team ID>)` |
| Notarization key | App Store Connect | API key, *Developer* role, file `AuthKey_<KeyID>.p8` |
| Workflow runners | Blacksmith | GitHub app installed on the organization; Ubuntu 24.04 x64 and arm64, macOS 15 on Apple Silicon, Windows Server 2025 |
| Windows signing | Azure Trusted Signing | account `ppt-signing`, certificate profile `ppt-app` — see [`tasks/windows-signing.md`](./tasks/windows-signing.md) |

Each artifact goes up with a `.sig` file beside it: the Ed25519 signature of the release key, the same as the agent's, over `pupitre-app\n<version>\n<system>\n<architecture>\n<sha256>\n`. It is also recorded in the `AppRelease` table, with the file's sum and size. On macOS and Windows, it is the system's signature that protects the installation; on Linux, this one is the only one, and it is verified by hand.

The three `latest*.yml` are what `electron-updater` reads. `electron-builder` writes them, the `app publish` step of `scripts/release` rewrites the links they contain as absolute URLs — artifacts live in their version's folder, feeds in their channel's — then deposits them under `app/stable/`. `promote` copies them under the channel it is named.

### The public bucket

An R2 bucket `ppt-downloads`, **public access enabled** through the custom domain `dl.pupitre.studio`, TLS 1.2 minimum. It contains only app artifacts, their `.sig`, their `.blockmap` and the update feeds. The agent's binary never enters it: it stays in the private bucket, served by a five-minute signed URL to a server that presents its token (see [`security.md`](./security.md)).

### The release secrets

They live in **a 1Password note**, `pupitre-GitHub` in the shared vault, one field per name; `scripts/release/release.env.tpl` references them, and `bun scripts/release/index.ts secrets` reads each reference through `op read` and sets it as a repository secret through `gh secret set` — to rerun when a value rotates in the note. The workflow hands each secret to the step that needs it, and reads the clear values from the same template. Nothing is ever written to a disk.

| Field | What it is | How to obtain it |
| --- | --- | --- |
| `PUPITRE_RELEASE_PRIVATE_KEY` | the private half of the Ed25519 key that signs the agent and the app's artifacts | `cd apps/agent && go run ./tools/release keygen`, once, outside any agent session |
| `PUPITRE_PUBLISH_TOKEN` | the publication token, prefixed `pupitre_pub_`: it opens only the four version routes, does not expire and belongs to no one | drawn once, set on the console's Worker and here — see [`deploy.md`](./deploy.md) |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | the chain's R2 access, over S3, limited to the two buckets — a Cloudflare API token would open all the account's | Cloudflare → *R2* → *Manage API tokens*, *Object Read & Write* on `ppt-agent` and `ppt-downloads` |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` | the Developer ID certificate as `.p12`, base 64, and its password; the runner imports it into a throwaway keychain for the duration of the build | Keychain Access → export the certificate and its private key as `.p12`, then `base64 -i certificate.p12 \| pbcopy` |
| `APPLE_API_KEY_CONTENT` | the `.p8` of the notarization key, in base 64 | `base64 -i AuthKey_<KeyID>.p8 \| pbcopy` |
| `APPLE_API_KEY_ID` | the key's identifier | the *Key ID* column in App Store Connect |
| `APPLE_API_ISSUER` | the issuer's identifier | at the top of App Store Connect's *Keys* page |

The values that are not secrets — the two platforms, the buckets' address and name, the R2 account identifier — are written in clear in the same template. A `stable` release refuses to build Windows as long as the four `AZURE_SIGNING_*` variables — the endpoint, the account, the profile and the publisher — and the three `AZURE_*` secrets of Azure Trusted Signing are not set — [`tasks/windows-signing.md`](./tasks/windows-signing.md).

No token enters the app's binary: the artifacts are public, and the app has nothing to present in order to update.

### The order of creation

The release key, the buckets, the Apple account, the notarization key, the 1Password note: [`deploy.md`](./deploy.md), steps 3 and 8.

### What each release does

Each step is a command of **`scripts/release`** — `bun scripts/release/index.ts <step>`, idempotent, driven by its environment, tryable with `--dry-run`. `scripts/release.sh` chains the first ones on the owner's Mac, with no secret at all, and pushes the tag; `.github/workflows/release.yml` chains the others on its runners, one job per system. The private bucket is the only place where a step passes something to the next: a job that fails is rerun alone, and any machine that holds the key resumes any step — the day the runners are our own, the workflow changes host and nothing else.

| Step | What it does |
| --- | --- |
| `next` | the next version from the last tag (`--patch` by default, `--minor`, `--major`, or `--version=`), written to `apps/desktop/package.json` |
| `resolve` | the version from this manifest, the channel — `stable` unless asked otherwise — and the refusal to start from anywhere but `staging` |
| `notes` | the changelog entry in both languages, drafted by `claude -p` from the commits since the last tag; **the script stops there so that it is read**, and resumes when rerun |
| `check` | the changelog in each language and the version the app declares |
| `ship` | commit `chore(release): vX.Y.Z` of the version and the notes, tag, push of `staging` and the tag; it is this push that launches `release.yml` |
| `agent build` | `pupitred` for `linux/amd64` and `linux/arm64`, compiled with no obfuscation, signed, tested — public key embedded, `version` and `hello` on the machine of each architecture — amd64 on the building runner, arm64 on the `agent-arm64` job, never under emulation — or **taken from the bucket** if it is already there: the platform holds the fingerprints of the first declaration |
| `agent publish` | `agent/<version>/` of the **private** bucket — binaries, `release.json`, `publications.json` — then `POST /api/v1/admin/releases` to production |
| `desktop` | the app for the runner's system — macOS signed and notarized in arm64 and x64, Windows signed by Azure Trusted Signing, Linux; in `stable`, a missing signing value stops the build; the agent taken from the bucket, the main process compiled to V8 bytecode, the fuses flipped; installers, blockmaps, macOS update `.zip` archives and feeds left under `work/<version>/<system>/` of the private bucket with the `index.json` that names them |
| `app publish` | signs with the release key each installer and each macOS update `.zip`, deposits files and `.sig` on the **public** bucket, rewrites the update feeds, declares each file through `POST /api/v1/admin/app-releases`, and keeps these rows in `app/<version>/publications.json` of the private bucket |
| `verify` | from the outside, what a customer meets: the platform describes the version, the public bucket serves each file whole, the channel's feeds name it and each file they name has its `.sig` — the report becomes the run's summary |
| `merge` | everything the version names is downloadable: the `staging` → `main` pull request is opened — the body is the English changelog entry — and merged by a merge commit; a pull request left open is taken over, a `main` that already holds the tag has nothing to do. The `main` push rebuilds the site and the console |
| `promote` | the rollback: `gh workflow run promote.yml -f version=X.Y.Z` puts a published version back in the channel, agent side and app side, and points the channel's feeds at its files |

A version therefore goes out **`stable`, in one go**, declared to production; nothing is rebuilt or re-signed — a second build would give other binaries, other signatures and other checksums for the same version number. Going back is promoting the previous version.

A build with no signing identity does not stop: electron-builder says so and produces an unsigned artifact — which is what makes `bun --cwd=apps/desktop run build:mac` usable on the owner's machine, and what a `beta` build does. A `stable` build stops: `desktop` refuses to start without the five Apple values or the seven Azure values, and passes `forceCodeSigning` to electron-builder, which fails rather than skip a signature. On a runner, `desktop` imports the note's certificate into a throwaway keychain; on a Mac that has the certificate in its keychain, it uses it. Apple keeps a notarization for several minutes without a word: `DEBUG=electron-notarize*` says where it stands.

A rollback is done by promoting the previous version: `electron-updater` does not go down a version, but the channel's feed points at the old one again, and an already-updated app waits for the next. A published version's artifacts are never deleted.

### The changelog

`apps/site/src/content/changelog/<language>/<version>.mdx` is the **only** source. One entry per version and per language, the file name being the version with dashes — `0-2-0.mdx`. The site does not render it: since 14 September 2026 there is no changelog page, the download page shows the published version and that is all.

| Who reads it | What it does with it |
| --- | --- |
| The release chain | `notes` drafts it through `claude -p` for the owner to review, `check` refuses to build if it is missing in either language, `app publish` passes the English entry's body as release notes |
| The platform | records it in `AppRelease.notes`, from where the console and the desktop app pull it through `GET /api/v1/releases/app/:version` |

`scripts/release-notes.ts` does both: `--check` verifies that a version is covered everywhere, with no argument it writes the entry's body. The stored notes are English because `AppRelease.notes` is a single string and English is the language the site serves without a prefix.

### What is built where

A native module is not compiled for another system: `node-pty` imposes one runner per OS, and that is the reason for the matrix `blacksmith-6vcpu-macos-15`, `blacksmith-4vcpu-windows-2025`, `blacksmith-4vcpu-ubuntu-2404` in `release.yml` — and the reason the release is not done from a Mac. From a Mac, `bun --cwd=apps/desktop run build:linux` stops on `node-gyp does not support cross-compiling native modules` — it is not a configuration error.

| System | What comes out | What signs it |
| --- | --- | --- |
| macOS | `.dmg` arm64 and x64, and each architecture's `.zip` for the update | Developer ID certificate, then notarization, then the release key |
| Windows | NSIS installer for the runner's architecture | Azure Trusted Signing — mandatory in `stable`, the publisher written into `app-update.yml` so that the installed app refuses an installer signed by someone else — then the release key |
| Linux | AppImage and `.deb` for the runner's architecture | the release key alone: Linux has no authority to answer to |

The `.deb` is called `pupitre` and not `@pupitre/desktop`: the workspace name carries a slash, which dpkg refuses. The Linux executable is called `pupitre` for the same reason, and `pupitre.desktop` aligns with it so that the desktop environment links the window to its launcher.

### The compatibility sheet

`packages/shared/src/compat` carries the only table that says which app drives which agent: one row per generation, with its protocol, the first app version and the first agent version of that generation. It goes into `apps/agent/internal/contract/schema.json` through `bun run contracts:export`, so the agent carries it compiled into itself.

Between two rows, all app versions drive all agent versions. A row is added the day one can no longer drive the other: the protocol removes or renames a field, in the same pass as the `PROTOCOL_VERSION` change, or a gesture changes path without the protocol changing. This is the case of 1.0: `{ protocol: 2, app: "1.0.0", agent: "1.0.0" }`, because a 1.0 agent reserves privileged commands for `pupitred serve --privileged` (decision 0015), which a 0.x app never opens. An agent's `hello` then refuses the app under its floor, even on the same protocol, with the version to reach; the app reads the same sheet and sends an agent under its own to reinstallation, which pushes the binary (`binary install`, or `sh -c` under the earlier `NOPASSWD:ALL` rule) then launches `agent.migrate`. `agent.upgrade` does not fit there: the earlier agent verifies its successor through a `hello` that carries its own version, which the successor refuses, and it rolls back. The 1.0 agent announces itself to its successor under the version it installs, so that a floor raised later no longer undoes an update.

### What the update does not cover

The `.deb` is installed by apt and updated by apt: the app does not touch it, and says so. The AppImage, the macOS app and the Windows installer replace themselves — on macOS, `electron-updater` never installs a `.dmg`: it downloads the `.zip` that `latest-mac.yml` names alongside, and a feed with no `.zip` leaves the app on "ZIP file not provided", which was the case until 0.2.0. A development build looks for no update; a packaged build follows the channel `MAIN_VITE_UPDATE_CHANNEL` gave it, `stable` by default, on the bucket `PUPITRE_DOWNLOADS_URL` gave it — the same variable the publication reads, `https://dl.pupitre.studio` when the build receives none.

Nothing installs without the release key, on all three systems (`src/main/updater.ts`): `electron-updater` downloads, but `autoInstallOnAppQuit` stays lowered; the download is `verifying` until the `.sig` published beside it holds for its bytes, then `ready`. The installation — requested, or at close on Linux and Windows — rereads the file and refuses any other than the one verified, with the same bytes; on macOS, the verified archive is handed at once to Squirrel.Mac, which installs it at close. On top of that, Squirrel.Mac verifies the Developer ID of what it installs and `electron-updater` the Authenticode publisher of the Windows installer.

## The database

Cloudflare **D1**, one online database: `ppt-db-enam` (`89b05eda-2e19-4643-a383-935836b4bbd8`), in North America (`enam`) like the three R2 buckets, bound as `DB` in `apps/web/wrangler.jsonc` and named in `environments.json`; locally, the D1 that miniflare keeps under `apps/web/.wrangler/state`. It replaced on 20 September 2026 `ppt-db` (`8c4cd3b5-7375-4a69-8b84-b3b78c734cf5`), created in Western Europe — a D1 region cannot be changed, you recreate and import — and is to be deleted once `main` is deployed on it. The Worker uses *smart placement*: it runs next to the database, not at the edge closest to the caller. There is no address, no secret, no compute to wake: the whole platform is at Cloudflare, and a database with no traffic costs nothing.

**Prisma 7 on the D1 adapter** (`@prisma/adapter-d1`), the schema in `provider = "sqlite"`. The Worker opens a client on its binding at each request and each workflow run (`withPrismaClient` in `src/worker.ts`); everything below reads it through `@pupitre/db/scope`, never seeing a binding — and a test gives it its own, a SQLite file built from the same migrations that D1 applies (`@pupitre/api/testing`). SQLite settles two things: no interactive transaction (none is written), and a case comparison is done in code, not in the query.

**Migrations are SQL files**, `packages/db/migrations/NNNN_<name>.sql`, in D1's registry (`d1_migrations`) and applied by wrangler: `bun run db:migrate <local|production>`, production with `PUPITRE_ALLOW_MIGRATE_ON=production` on the command line. `bun run db:migrate:new <name>` writes the next one: the migrations replayed on a throwaway SQLite, the schema diffed against it. `bun run db:reset <target>` drops all tables then replays everything. The build (`build:production`) migrates before building; the CI applies the migrations on an empty local database, and the tests replay them. Locally, `dev:prepare` migrates miniflare's D1: the console starts on a database that exists.

**Pupitre's organization and its administrator are set by a seed**, `bun run db:seed <local|production> <address>`, production with `PUPITRE_ALLOW_MIGRATE_ON=production` on the command line, like a migration. It creates the `pupitre` organization under the identifier `org_pupitre`, gives the account of this address the identifier `usr_pupitre_admin` and the `platform_admin` role, and enrols it as owner of this organization under `mem_pupitre_admin` — the five identifiers are those of `@pupitre/shared/platform`, and they no longer move. Better Auth created this account with a randomly drawn identifier: the seed renames it, and the `ON UPDATE CASCADE` foreign keys carry along everything that referred to it; `ServerRevokedDevice.revokedByUserId` and `AffiliateLink.createdById`, which have none, are taken over by hand in the same pass. D1 opens no transaction: each statement is idempotent on its own, and replaying the seed changes nothing. It refuses rather than overwrite — another organization on the `pupitre` slug, another account on `usr_pupitre_admin` — and says in one line what it did with each of the three rows.

## Dependencies

The root `package.json`'s `overrides` are the single source of truth for the install tree; Bun ignores per-workspace overrides. Each pin has a reason written here; none is added without a passing `bun audit` and `bun run build`.

A dependency that several workspaces share takes its version from the root `package.json`'s `catalog`, and each workspace declares it `catalog:`: it is raised in a single place. What a single workspace uses stays hard-coded, `vite` and `@vitejs/plugin-react` — the desktop app stays on Vite 7 until `electron-vite` accepts Vite 8 — and the Prisma family, because the versions declared in `packages/db/package.json` enter the generated client's fingerprint.

Node (`engines`) and Bun (`packageManager`) are declared only at the root: no workspace installs alone.

Pins inherited from React-Box, to recheck at the first upgrade: `typescript ^6` (TS 7 still breaks tools), `ultracite 7.8.3` (the next version reformats the whole repository), `better-auth` exact (minors have already broken `customSession`).

**The development `workerd`'s heap.** The `workerd` that miniflare launches under `bun run dev:web` runs with the default V8 heap, about 1.4 GB, whereas the console's Worker stabilizes closer to 1.8 GB after a long HMR session. Miniflare 5 reads `MINIFLARE_WORKERD_V8_FLAGS` and passes it to the workerd configuration's `v8Flags` field: `apps/web`'s `dev` script sets it to `--max-old-space-size=4096`. No patch is needed, and miniflare 5 itself relaunches a `workerd` that dies.

## External dashboards

Cloudflare Builds, Cloudflare Email Sending, Cloudflare Email Routing (the `pupitre.studio` catch-all rule), D1 (both databases), R2 (the three buckets: `ppt-downloads` and its public domain, `ppt-agent`, `ppt-mail`), Stripe, Apple Developer, Azure Trusted Signing. This document is what describes them; nothing in the repository can verify what they run. When a table above changes, the dashboard changes in the same pass.
