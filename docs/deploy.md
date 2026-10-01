# Putting Pupitre online

This document assumes you do not know the project. It gives the steps in order, the exact command each time, and what breaks when a step is skipped. Followed from end to end, it takes you from a Git repository to a service that answers.

Allow half a day the first time, half of it waiting for third-party account verifications.

## 1. What you are putting online

Four things, on a single online environment.

| What is published | Where | What triggers it |
| --- | --- | --- |
| The console and the API — a single Cloudflare Worker | `app.pupitre.studio` | a push to `main` |
| The marketing site — a Worker with static assets | `pupitre.studio` | the same push |
| The desktop app (macOS, Windows, Linux) | the public bucket `ppt-downloads`, served by `dl.pupitre.studio` | a `vX.Y.Z` tag on `staging`, set by `scripts/release.sh` from the owner's Mac, built and published by `release.yml` |
| The `pupitred` agent, installed on the customer's server | the private bucket `ppt-agent`, which nothing reaches directly | the same tag |

**No online staging.** Everything is tried locally, end to end: the console on miniflare's D1, the development desktop app through the `dev.pupitre.studio` tunnel, the agent on a throwaway VPS. A release is what moves `main` forward: `release.yml` builds, publishes, verifies, then merges `staging` into `main`, and that push deploys the site and the console.

The branches: `staging` is the working branch, `main` is production and changes only through the `staging` → `main` pull request — the one a release opens and merges, or one by hand when neither the app nor the agent changes, always as a merge commit. The repository's hooks refuse to commit to it locally. See [`monorepo.md`](./monorepo.md#branches).

## 2. Before you start

### The accounts

| Account | What it carries | Cost | Lead time |
| --- | --- | --- | --- |
| **Cloudflare** | the domain, the Worker, the site, the two file buckets | free to start | immediate |
| **Stripe** | the product and its two prices | commission per sale | a few days of verification |
| **GitHub** | the repository and its workflows | free | immediate |
| **GitHub Actions** | the hosted runners that verify, build and publish each version | free and unlimited for a public repository on the standard runners | immediate |
| Apple Developer | signing the macOS app | $99/year | a few days |
| Azure Trusted Signing | signing the Windows app | pay-per-use | a few days of verification |

The first five are enough to put the service online. The last two concern only publishing the desktop app: without them, a `stable` release stops on the macOS or Windows runner rather than publish an unsigned installer; only a `beta` or local build comes out unsigned, and says so. Temporary exception: as long as Azure is not open, `release.yml` sets `PUPITRE_ALLOW_UNSIGNED_WINDOWS: "1"` and Windows comes out unsigned in `stable` ([the task](./tasks/windows-signing.md)).

### The tools

```bash
bun install                 # from the repository root
bun x wrangler login        # opens the browser: choose the account that carries the domain, the Workers and the databases
gh auth status              # must show the account that owns the repository
```

### The rule on secrets

**No value is typed by hand into a file of the repository.** Each secret is stored in 1Password — the vault and the note of each environment are named in [`environments.json`](../environments.json) — and `bun run dev:prepare` fetches those of the `local` note for development. The repository contains only references; a hook refuses the commit that would carry a value.

## 3. The eleven secrets

This is the part that blocks everyone. It is here in full.

The Worker requires **all eleven**. The list lives in [`apps/web/wrangler.jsonc`](../apps/web/wrangler.jsonc) under `secrets.required`, and `deploy:production` refuses to go if one is missing: it is a safeguard, not a preference. The four `STRIPE_*` are not part of it: production runs with `BILLING_MODE=off` (in the `vars`), which sells nothing and never calls Stripe; `check:secrets` requires them only of an environment whose `BILLING_MODE` is `stripe` ([decision 0018](./decisions/0018-source-available-and-free.md)). `LAUNCH_ENDS_AT` no longer exists. So there is no "deploy first, complete later".

On the other hand you can obtain them in order, and three of them are made with one command.

### At a glance

| Secret | What it is for | Where to get it | local and production |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | signs login sessions | you generate it yourself | **different values** |
| `INTERNAL_WORKFLOW_SECRET` | locks the internal trigger of background tasks | you generate it yourself | **different values** |
| `PUPITRE_PUBLISH_TOKEN` | lets the CI declare a version published | you generate it yourself | same value on both sides |
| `STRIPE_SECRET_KEY` | open a payment — **only in `BILLING_MODE=stripe`** | Stripe | sandbox / live |
| `STRIPE_WEBHOOK_SECRET` | verify that Stripe is the sender — same | Stripe | sandbox / live |
| `STRIPE_PRICE_SERVER_MONTH` | the monthly price of a licence seat — same | Stripe | sandbox / live |
| `STRIPE_PRICE_SERVER_YEAR` | the annual price of a licence seat — same | Stripe | sandbox / live |
| `R2_ACCOUNT_ID` | serve the agent's binary, sign the mailbox's attachments | Cloudflare | same value on both sides |
| `R2_ACCESS_KEY_ID` | same | Cloudflare | same value on both sides |
| `R2_SECRET_ACCESS_KEY` | same | Cloudflare | same value on both sides |
| `R2_BUCKET_NAME` | the binary's bucket — is `ppt-agent` | it is the bucket's name | same value on both sides |

| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | sign-in with GitHub | the GitHub OAuth App | **one OAuth App per host**: GitHub accepts only one callback address per app |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | sign-in with Google | Google Cloud, "Web application" OAuth client ID | same client possible, one redirect URI per host |

**The four social sign-in secrets are required, but the product does without them**: the sign-in screen shows only the providers whose ID and secret are present, and without them there remain the email link and the passkey. They are in the list so that the online console offers them, and so that a forgotten value shows at deployment rather than on screen. The callback address is `https://<host>/api/auth/callback/github` and `…/callback/google`; a GitHub OAuth App knows only one host, so you need one for `localhost:3000` and one for production.

### What breaks if one is wrong

A secret that is present but wrong does not block the deployment: the safeguard counts the secrets, it does not try them. Here is what you will observe.

| Wrong or dummy | What still works | What breaks |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | the public pages | every sign-in |
| `INTERNAL_WORKFLOW_SECRET` | everything, scheduled tasks included | only the manual trigger of a background task, which serves only in development |
| `PUPITRE_PUBLISH_TOKEN` | the whole service | the CI can no longer declare a version published |
| the four `STRIPE_*`, in `BILLING_MODE=stripe` | sign-in, the console, adding a server | buying a licence; in `off`, they are not used |
| the four `R2_*` | the entire console | the app cannot download the agent, so no installation on a server; the mailbox can neither open nor attach an attachment |

In other words: `BETTER_AUTH_SECRET` is the only one whose wrong value makes the service unusable. The others degrade one function, and say so. The database is not a secret: it is a D1 **bound** to the Worker by `wrangler.jsonc`, with no address or password.

### The three the machine generates itself

No third-party account, and nothing to type: they are drawn at random and deposited directly into the notes.

```bash
bun run secrets:draw
```

`scripts/draw-secrets.ts` reads each note named in `environments.json` and the release note, and fills in what is missing: `BETTER_AUTH_SECRET` and `INTERNAL_WORKFLOW_SECRET` specific to each online environment (the workstation draws its own in `dev:prepare`), and a single `PUPITRE_PUBLISH_TOKEN`, word for word identical in the environments' notes and in the release's (step 8) — if it already exists in one, that is the one copied, and two notes that disagree stop the command. A field already filled is never replaced: rotating `BETTER_AUTH_SECRET` signs everyone out, so to remove a value you empty the field in 1Password and rerun. Nothing is printed but names.

The `pupitre_pub_` prefix is what the platform recognizes a publication token by; without it, it takes it for a session and refuses it. A new value is then set on the Worker (step 6) and in the GitHub secrets (step 8).

### The four `R2_*` — Cloudflare

They serve two purposes: letting the platform distribute the agent's binary from a bucket that nothing else reaches, and signing the addresses through which the console reads and deposits the mailbox's attachments, on `ppt-mail`.

Cloudflare → **R2** → *Manage API tokens* → *Create API token*. **Object Read & Write** permission, restricted to the two buckets `ppt-agent` and `ppt-mail` — read for the binary, write so that a signed upload from the console is accepted. Cloudflare then shows a key and a secret — **the secret is shown only once**.

| Variable | Value |
| --- | --- |
| `R2_ACCOUNT_ID` | your Cloudflare account's identifier, in the dashboard |
| `R2_ACCESS_KEY_ID` | the key the token has just returned |
| `R2_SECRET_ACCESS_KEY` | the secret, shown only once |
| `R2_BUCKET_NAME` | `ppt-agent` |

The mail bucket's name is not a secret: `R2_MAIL_BUCKET_NAME` is `ppt-mail` in `wrangler.jsonc`'s `vars`.

Create **a second token** in the same place, with **Object Read & Write** on `ppt-agent` and `ppt-downloads`: its key and secret become `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in the release's 1Password note, step 8. The release chain speaks S3 directly, with that token, and nothing else: a Cloudflare API token would open all the account's buckets, this one opens only the two. Do not reuse the first — the Worker's has no business touching the public bucket.

### The four `STRIPE_*` — Stripe, dormant

**Nothing to do today**: production runs with `BILLING_MODE=off`, Pupitre is free up to three servers per organization and licences beyond are granted from the admin console. What follows serves only the day licences are sold and `BILLING_MODE` goes to `stripe`; no price is decided.

One product and two prices, to be created **twice**: in sandbox for the workstation, in live for production. The two notes can share the key and the prices as long as production stays in sandbox, production having its own webhook.

| | |
| --- | --- |
| Product | a licence seat beyond the free servers, tax code `txcd_10103001` (online software, business use) |
| Monthly price | to be decided → `STRIPE_PRICE_SERVER_MONTH` |
| Annual price | to be decided → `STRIPE_PRICE_SERVER_YEAR` |

`STRIPE_SECRET_KEY` is taken from *Developers* → *API keys*.

`STRIPE_WEBHOOK_SECRET` needs an online address: it comes from an endpoint created at `https://<your-domain>/api/v1/webhooks/stripe`. **So you cannot get it before step 6.** Two ways out: create the Worker a first time with a dummy value for that one secret and replace it afterwards, or do step 6 knowing that buying a licence will work only after that return. Nothing else depends on it. It is the document's only circularity, and it costs one round trip.

Three settings to make once in the Stripe dashboard: **Managed Payments** enabled and terms accepted — that is what makes Stripe the seller, who calculates and remits the tax; the support address up to date, because Stripe escalates there and refunds without an answer within 48 hours; the customer portal limited to the payment method, invoices and cancellation, **never to the quantity** — the number of servers is changed from the console, not from Stripe.

## 4. The domain and the buckets

`pupitre.studio` is on the Cloudflare account. **Every resource created there carries the `ppt-` prefix**: the account hosts several products, and without this prefix they can no longer be told apart.

Two R2 buckets, two regimes.

**`ppt-downloads`, public.** It contains only the app's files and their signatures. Its public address:

```bash
bun x wrangler r2 bucket domain add ppt-downloads \
  --domain dl.pupitre.studio --zone-id <zone identifier> --min-tls 1.2
```

Verify: `curl -I https://dl.pupitre.studio` answers **404 served by Cloudflare**. A 404 is the good sign — the bucket answers, and its root is empty.

**`ppt-agent`, private.** No public address, no `r2.dev` URL. Nothing reaches it from the internet: that is what keeps the agent's binary out of reach. The platform serves its content through a signed address valid for five minutes, which it calculates itself, and only to a server that presents its token.

**`ppt-mail`, private.** Everything an email carries beyond its text: the raw message, its HTML body, its attachments. D1 holds the thread, the bucket holds the bytes. No public address, no `r2.dev` URL. The Worker writes and reads there through the `MAIL` binding; the console, for its part, reads and deposits attachments **directly in the bucket**, through ten-minute signed addresses that the platform calculates with the `R2_*` — hence the CORS rule, without which the browser refuses the `PUT` and inline reading. Default jurisdiction.

```bash
bun x wrangler r2 bucket create ppt-mail
bun x wrangler r2 bucket cors set ppt-mail --file apps/web/r2-mail-cors.json
```

`apps/web/r2-mail-cors.json` states the rule: origins `https://app.pupitre.studio` and `http://localhost:3000`, methods `GET` and `PUT`, only the `content-type` header, preflight caching for one hour. Verify with `bun x wrangler r2 bucket cors list ppt-mail`. The Worker's R2 token (step 3) must read and write on this bucket: a signed address opens only what its key can open.

**Email, what goes out.** The Worker sends through Email Sending's `send_email` binding: enable Email Sending on the account and have the `pupitre.studio` domain verified as a sender (the DKIM and SPF records are set on the zone). Also have the mailbox's four sending addresses verified — `support@`, `legal@`, `privacy@`, `security@` — in *Email Sending → Destination addresses*: they are the only ones a console reply can carry. Without a verified domain no sign-in link goes out, so nobody signs in.

**Email, what comes in.** Everything written to `*@pupitre.studio` enters the platform's database, and the team replies from the console — [`contracts/platform-mail.md`](./contracts/platform-mail.md). On the zone, in *Email → Email Routing*:

1. **Enable Email Routing**: Cloudflare sets the MX records and the SPF TXT on `pupitre.studio`. Email Sending's records stay; the two coexist.
2. **Routing rules → Catch-all address → Edit**: action *Send to a Worker*, destination `ppt-web-production`, then **Enable**. No address is declared one by one.

The Worker must be deployed before the rule can name it: this step is therefore done after the first deployment. Verify by writing to `support@pupitre.studio` from an outside address; the thread appears in the console under `/dashboard/admin`. An exception in the handler is a **temporary** failure: Cloudflare re-presents the message, and a resend is recognized as a duplicate.

## 5. The database

A **Cloudflare D1** database, `ppt-db-enam`, in North America like the R2 buckets, bound to the Worker as `DB` in `apps/web/wrangler.jsonc` — [`environments.json`](../environments.json) names it too. It already exists (`wrangler d1 create ppt-db-enam --location enam`, once). A D1 region is chosen at creation and does not move: changing it means creating a database, `wrangler d1 export` the old one, `wrangler d1 execute --file` the dump into the new one — splitting any value beyond 100 KB, a statement's limit, like a server's `metrics` column —, then changing `database_id` here and deploying. Nothing to connect: the Worker runs next to it (*smart placement*), and there is no address, no password, no compute that sleeps or wakes — you pay for rows read and written, and the free tier gives millions a day.

Migrations are SQL files, `packages/db/migrations/NNNN_<name>.sql`, which D1 keeps in its own registry. The build applies them **before** building, every time; from your workstation:

```bash
bun run db:migrate local                                        # the D1 that miniflare keeps under apps/web/.wrangler/state
PUPITRE_ALLOW_MIGRATE_ON=production bun run db:migrate production
bun run db:migrate:new <name>                                   # the next file, by diffing the Prisma schema against the migrations
bun run db:reset local                                          # all tables dropped, then all migrations
bun run db:seed local <address>                                 # Pupitre's organization and its administrator
PUPITRE_ALLOW_MIGRATE_ON=production bun run db:seed production <address>
```

A migrated database is empty: the seed places Pupitre's organization there, `pupitre` under the identifier `org_pupitre`, then makes the account of the given address its owner and the platform administrator, under `usr_pupitre_admin` and the `platform_admin` role. The account need not exist beforehand; if it exists — Better Auth created it at first sign-in with a randomly drawn identifier — the seed renames it, and everything that referred to it follows. It can be replayed as often as you like: the second time changes nothing, and it stops without writing anything if another account or another organization already holds one of these identifiers.

`db:reset` and `db:seed` on production require the same flag. A D1 database also returns to any instant of the last thirty days through *Time Travel*: `wrangler d1 time-travel restore ppt-db-enam --timestamp=<ISO>`.

## 6. The first deployment, by hand

A Worker is born with its eleven secrets, or is not born: `wrangler deploy` refuses to create a Worker for which a `secrets.required` secret is missing, and `wrangler secret put` cannot attach anything to a Worker that does not exist yet. The first deployment therefore supplies all eleven at once, through `--secrets-file`. It is done once, without going through the automatic build.

The values live in 1Password: one note per environment, `pupitre` (`local`, the workstation) and `pupitre-prod`, named in [`environments.json`](../environments.json), one field per secret, named exactly as the Worker expects it. The secrets file never exists on disk: it is composed on the fly from 1Password and handed to `wrangler` through a process substitution.

From a working branch:

```bash
bun run env production -- bun --cwd=apps/web run build:production
bun x wrangler deploy --config apps/web/dist/server/wrangler.json --keep-vars \
  --secrets-file <(op item get pupitre-prod --vault "DEV - React Consulting" --format json \
    | jq '[.fields[] | select(.label and .value)] | map({(.label): .value}) | add')
```

The Worker is called `ppt-web-production`. Nothing is entered in the dashboard: the address, the scheduled tasks and the service links all come from `wrangler.jsonc`.

Afterwards, a secret that changes is set alone, or all at once, through the same channel:

```bash
op read "op://DEV - React Consulting/pupitre-prod/PUPITRE_PUBLISH_TOKEN" \
  | bun x wrangler secret put PUPITRE_PUBLISH_TOKEN --config apps/web/wrangler.jsonc --env production
bun x wrangler secret bulk --config apps/web/wrangler.jsonc --env production <(op item get pupitre-prod \
  --vault "DEV - React Consulting" --format json \
  | jq '[.fields[] | select(.label and .value)] | map({(.label): .value}) | add')
bun --cwd=apps/web run check:secrets production     # must say everything is there
```

The values of the `pupitre-prod` note differ from the workstation's: its own `BETTER_AUTH_SECRET` and `INTERNAL_WORKFLOW_SECRET`, and, the day Stripe is used, its own webhook. The four `R2_*` and the publication token are the same in both notes.

Verify:

```bash
curl -s https://app.pupitre.studio/api/v1/health       # {"ok":true}
curl -sI https://app.pupitre.studio/status | head -1    # 200, without being signed in
```

## 7. Automatic deployments

From here on, nothing is deployed by hand.

**A Workers Builds project** on the repository, for the `ppt-web-production` Worker. Creation goes through a GitHub authorization in the dashboard — *Workers & Pages* → the Worker → *Settings* → *Build* → *Connect to Git*; it cannot be automated.

| | production |
| --- | --- |
| Watched branch | `main` |
| Build command | `bun install --frozen-lockfile && bun --cwd=apps/web run build:production` |
| Deploy command | `bun --cwd=apps/web run deploy:production` |
| Build variable | `VITE_APP_URL=https://app.pupitre.studio` |
| Build secrets | none: the database is bound, and wrangler migrates with the Builds project's token |

The build migrates D1 **before** building, and the deployment refuses to go if a secret is missing: both fail before having touched the Worker in place.

**One more Workers Builds project** for the marketing site, on the `ppt-site` Worker. A Pages project linked to Git can be created only in the dashboard and is never converted; the site is therefore a Worker with static assets like the console, deployable from here before the automatic one exists.

| | production |
| --- | --- |
| Watched branch | `main` |
| Build command | `bun install --frozen-lockfile && bun --cwd=apps/site run build:production` |
| Deploy command | `bun --cwd=apps/site run deploy:production` |

The build script carries `PUBLIC_RELEASES_URL` — the list of versions the download page reads — and `PUBLIC_CF_WEB_ANALYTICS_TOKEN` — the public site token of Cloudflare Web Analytics for `pupitre.studio`, created in the dashboard under *Web Analytics* → *Add a site*, manual setup (JS snippet), never the automatic one — and sets `PUPITRE_ENV=production`, which makes the legal guard refuse a `TODO` in a legal page. If the API does not answer, the build does not fail: the page goes out with a list written in the repository and a warning. The redirects and the security headers are in `apps/site/public/`, read by the asset layer; `www` is redirected to the apex by `apps/site/worker/index.ts`, the only thing that layer cannot express.

The site's first deployment is done by hand, with no secret to supply:

```bash
bun --cwd=apps/site run build:production && bun --cwd=apps/site run deploy:production
```

`main` moves forward through a release — the version is then already declared to the platform and downloadable when the site rereads the list of versions — or through a `staging` → `main` pull request merged as a merge commit when only the console, the site or the mails change.

## 8. GitHub

### The repository's settings

```bash
gh repo edit <account>/pupitre \
  --enable-squash-merge=false --enable-rebase-merge=false --enable-merge-commit
gh api -X PUT repos/<account>/pupitre/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
```

Squash is forbidden because it rewrites commits: a version's tagged commit would leave `main`'s history, and `next` would count from the wrong tag. The second command allows GitHub Actions to open pull requests — *Settings* → *Actions* → *General* → *Allow GitHub Actions to create and approve pull requests*: without it, `release.yml`'s last job builds everything and cannot merge.

**As long as this repository is private, in an organization on the free GitHub plan**, GitHub refuses branch protection, rulesets, required checks and mandatory reviewers (the API answers 403). The code is now public under Apache 2.0 + Commons Clause ([decision 0018](./decisions/0018-source-available-and-free.md)): the day the repository goes public, these protections become available on the free plan and are set on `main`, and this paragraph changes. `main` therefore has **no server-side protection**. What holds in its place: the repository's hooks, on the only machine where `bun install` has run, and the release itself — `release.yml` calls `ci.yml` before any build, and `merge` merges the `staging` → `main` pull request only with a green CI on its head commit (see [`monorepo.md`](./monorepo.md#checks)). A pull request merged by hand is held by nothing. The API's message mentions GitHub Pro, which applies to a personal account; for an organization, it is GitHub Team.

## 8 bis. The release's 1Password note

`release.yml`'s runners read their secrets from those of the GitHub repository, and these come from **a 1Password note**, `pupitre-GitHub` in the shared vault: `scripts/release/release.env.tpl` says which fields it expects, and `bun scripts/release/index.ts secrets` reads each through `op read` and sets it through `gh secret set` — to rerun each time a value rotates. Nothing is ever written to a file. The public values (the platform, the buckets, the R2 account identifier) are in clear in the template, and the workflow reads them there.

| Field | Where it comes from | Without it |
| --- | --- | --- |
| `PUPITRE_PUBLISH_TOKEN` | the same value as in step 3, word for word | the version builds and is not declared |
| `PUPITRE_RELEASE_PRIVATE_KEY` | `cd apps/agent && go run ./tools/release keygen`, once | nothing builds |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | the second R2 token from step 3, *Object Read & Write* on the two buckets | nothing goes up to the buckets |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` | the Developer ID certificate exported from the keychain as `.p12`, `base64 -i certificate.p12 \| pbcopy`, and its password | a `stable` release stops on macOS |
| `APPLE_API_KEY_CONTENT` | `base64 -i AuthKey_<id>.p8 \| pbcopy` | same |
| `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | the *Keys* page of App Store Connect | same |

The first three lines are enough for a `beta` build. The others sign and notarize the macOS app: the runner imports the certificate into a throwaway keychain for the duration of the build. Windows requires Azure Trusted Signing — four `AZURE_SIGNING_*` variables and three `AZURE_*` secrets, [`tasks/windows-signing.md`](./tasks/windows-signing.md): without them, a `stable` release stops on the Windows runner.

**The publication key deserves a sentence.** A single key pair signs everything Pupitre publishes, forever. Its private half is in this note and nowhere else; its public half is already written in the app's code. The two go together: an app that knows one public key and an agent signed with another refuse every update, with no useful message. Do not regenerate it.

**Rotating the publication token cuts nothing**, in this order: set the new one on the Worker as `PUPITRE_PUBLISH_TOKEN` and the old one as `PUPITRE_PUBLISH_TOKEN_PREVIOUS`, change the note's field, then remove the old one. The platform accepts both in the meantime.

## 9. The first published version

```bash
git switch staging && git pull --ff-only
scripts/release.sh --version=0.1.0     # writes the version, drafts the notes, stops
# review apps/site/src/content/changelog/{en,fr}/0-1-0.mdx
scripts/release.sh                      # verifies, commits, tags, pushes
```

The second pass commits `chore(release): v0.1.0`, sets the tag and pushes; the tag's push launches `release.yml`, which builds and publishes the agent then the app to the buckets, declares the version to the platform as `stable`, verifies from the outside that everything downloads — the run's summary says what — then opens the `staging` → `main` pull request and merges it. That `main` push rebuilds the site and the console. The chain refuses to start if the changelog does not cover the version in both languages, or if the tag is not on `staging`. A job that fails is rerun alone from GitHub: each step is idempotent, the merge included.

Going back is promoting the previous version: `gh workflow run promote.yml -f version=X.Y.Z`. It is **the same file**, the one that was published, that the channel points to again — nothing is rebuilt. A second build would give other signatures for the same number.

## 10. Verifying that everything holds

```bash
curl -s https://app.pupitre.studio/api/v1/health                      # {"ok":true}
curl -sI https://pupitre.studio | head -1                             # 200
curl -s "https://app.pupitre.studio/api/v1/releases/app/latest" | head -c 200
curl -sI https://dl.pupitre.studio/app/0.1.0/latest.yml | head -1     # 200
```

Then, by hand: open the `.dmg` on a Mac that has never seen the certificate, with no warning; install on Windows without SmartScreen blocking; and have the app install the agent on a test server.

## 11. If it breaks

| Symptom | Most likely cause |
| --- | --- |
| The deployment refuses to go, naming secrets | one is missing: `check:secrets <environment>` lists them |
| The site answers but no sign-in succeeds | `BETTER_AUTH_SECRET` absent, or different from the one that signed the sessions |
| No email goes out | Email Sending not enabled, or `pupitre.studio` not verified as a sender domain |
| Nothing arrives in the console's mailbox | Email Routing not enabled on the zone, or the catch-all rule does not point to the production Worker |
| A thread opens but its HTML and attachments are missing | the `ppt-mail` bucket does not exist, or the `MAIL` binding is not in the deployed environment |
| An attachment does not open, or uploading a file fails in the browser | `ppt-mail`'s CORS rule is not set (step 4), or the Worker's R2 token does not read and write on this bucket |
| The app says there is nothing to download | the four `R2_*` are wrong: the platform returns a local address and says so in a header |
| The build fails on the migration | a file in `packages/db/migrations` does not apply on D1: it is applied locally first, `bun run db:migrate local`, and the tests replay it |
| `wrangler deploy` refuses `legacy_env` in the generated configuration | `@cloudflare/vite-plugin` and `wrangler` are no longer at the same level: the plugin writes the configuration wrangler reads, the two are updated together |
| The first deployment refuses, naming the eleven secrets | it is a Worker that does not exist yet: it is born with `--secrets-file`, step 6 |
| The chain publishes but the platform refuses | `PUPITRE_PUBLISH_TOKEN` differs between the 1Password note and the Worker, or has lost its prefix |
| The release builds everything and the `Merge into main` job fails while opening the pull request | GitHub Actions does not have the right to create pull requests: step 8 |
| `next` proposes a version already released | the pull request was merged as a squash or a rebase, and the tagged commit left `main`'s history |

A Worker rollback is done on its versions: `bun x wrangler rollback --config apps/web/dist/server/wrangler.json`. A database migration, for its part, is not replayed backwards — a migration that breaks is fixed by a following migration.

## 12. What nothing automates

- **A secret or a certificate.** None enters the repository, a build log or a conversation.
- **The creation of the Workers Builds projects**, which goes through a GitHub authorization in the dashboard.
- **The Azure Trusted Signing account**: the identity is validated by Microsoft, on supporting documents; as long as it is missing, no `stable` release comes out.
- **Reviewing the release notes**: `claude -p` drafts them, the owner reads them before they are committed.
- **Updating this document.** When a setting changes in a dashboard, it changes here in the same pass: it is the only trace the repository keeps of it.
