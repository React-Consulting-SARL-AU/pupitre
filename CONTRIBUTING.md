# Contributing to Pupitre

Thanks for wanting to help. Pupitre is a desktop app, a Go agent and a hosted platform that turn a rented Ubuntu server into a workshop for AI agents. Bug reports, fixes, new catalogue modules, documentation and translations are all welcome.

Please read the [code of conduct](./CODE_OF_CONDUCT.md) first. Never report a vulnerability in public: follow [`SECURITY.md`](./SECURITY.md).

## The licence of your contribution

Pupitre is **source-available**, not open source: the code is under the Apache License 2.0 with the Commons Clause ([`LICENSE`](./LICENSE)), licensed by React Consulting SARL AU. Anyone may read, modify and self-host it; nobody may sell it, nor sell a service whose value derives substantially from it.

By opening a pull request, you agree that your contribution is licensed under the same terms, as section 5 of the Apache License states, and that you have the right to submit it. There is no separate agreement to sign.

## Before you start

- **Small fix** (a typo, an obvious bug, a test): open the pull request directly.
- **Anything larger** — a new feature, a new catalogue module, a change to how the app and the agent talk — open an issue first and describe what you want to do. Some rules of the project are strict (below), and agreeing on the shape first saves you from rewriting it.
- Look for issues labelled `good first issue` or `help wanted` if you want a place to start.

## Set up your machine

[`docs/getting-started.md`](./docs/getting-started.md) has the full guide. In short:

```bash
git clone https://github.com/React-Consulting-SARL-AU/pupitre.git
cd pupitre
bun install
bun dev                 # the site on :4321, the console on :3000
bun run dev:desktop     # the desktop app, against the local console
```

You need Bun 1.3.14, Node 22+, Go 1.26+, Git and OpenSSH. Docker is useful to try the agent on the disposable test server in `apps/agent/test/vps`. No secret, no account and no paid service is needed to develop: what needs a shared secret (mail, social sign-in, storage) simply stays off.

**Never run a development build of the agent against a server you care about.** Use the test container.

## How the repository is organized

```txt
apps/site        Astro — pupitre.studio: marketing, public docs, blog, legal pages
apps/web         TanStack Start on Cloudflare Workers — app.pupitre.studio: console, /api/v1, /api/auth
apps/desktop     Electron — the app
apps/agent       Go — pupitred, the agent installed on the server

packages/db      Prisma schema, D1 SQL migrations, generated clients
packages/auth    Better Auth configuration and clients
packages/api     the Elysia /api/v1 app, its client and test harness
packages/shared  contracts shared across apps: agent protocol, catalogue, licences, legal
packages/design  monochrome CSS tokens and Tailwind preset
```

Each workspace has a guide — `apps/*/CLAUDE.md` — with its stack, its rules and its commands. Read the one of the workspace you touch. They are written for human and AI contributors alike.

## The rules that matter most

These come from [`CLAUDE.md`](./CLAUDE.md) and [`docs/architecture.md`](./docs/architecture.md). A pull request that breaks one will be asked to change.

1. **The customer's server is the source of truth** for what concerns it. No private key ever leaves the customer's laptop. Nothing ever connects *into* the customer's server. The platform never receives a project, a secret or a file of a server.
2. **The contract comes first.** Anything that crosses a boundary — app ↔ agent, app ↔ platform, console ↔ API — is typed in `packages/shared` before it is implemented on both sides. Run `bun run contracts:export` after changing it.
3. **An update never reinstalls anything.** Changing the shape of a file the agent or the app reads back — `/etc/pupitre/*` on the server, the app's own files on the laptop — comes with a numbered migration in the matching registry, never with code that reads both shapes. See [`docs/contracts/config-migrations.md`](./docs/contracts/config-migrations.md).
4. **The design is monochrome.** Semantic tokens from `packages/design` only, never a hard-coded colour; colour only ever expresses a state. See [`docs/product/DESIGN.md`](./docs/product/DESIGN.md).
5. **Every user-facing sentence exists in English and in French**, in the i18n dictionaries of the workspace — never hard-coded in a component.
6. **Reuse before creating.** Look for an existing primitive (`components/ui`, `hooks`, `lib`) and extend it rather than writing a second one. One React component per file outside `components/ui`.
7. **Quality without shortcuts:** zero lint or type error, no dead code, error handling only at real boundaries (user input, external APIs), tests for the behaviour you change.
8. **Comments are a last resort**, in English, one short line explaining a *why* that the code cannot say. No commented-out code.
9. **No secret in the repository**, ever — not in code, fixtures, logs or screenshots. A hook checks before each commit.

## Making a change

1. **Branch from `staging`.** `staging` is where work lands; `main` is production and only moves through the release pull request.
2. **Write the test first** for the behaviour you expect, then the code.
3. **Stay in scope.** If you notice something unrelated that needs fixing, open an issue rather than folding it into your pull request.
4. **Run the checks** before you push. The pre-push hook runs them too:

   ```bash
   bun run lint:fix
   bun run lint
   bun run check:types
   bun run test
   ```

   If you touched the agent: `bun --cwd=apps/agent run test` and `bun --cwd=apps/agent run lint`. If you touched a screen, run it — green tests do not prove a screen works.
5. **Commit with [Conventional Commits](https://www.conventionalcommits.org/), in English:** `feat(desktop): inspection screen`, `fix(agent): keep the tunnel when the read fails`. The scope is the workspace (`site`, `web`, `api`, `desktop`, `agent`, `shared`, `db`, `auth`, `design`). Never `--no-verify`.
6. **Open the pull request against `staging`** and fill in the template: what changes, what proves it, the output of the checks.

A maintainer reviews it. Expect questions and requests for changes; they are about keeping the rules above true, not about you. Once approved, the pull request is merged into `staging` and ships with the next release.

## Adding a service to the catalogue

A catalogue module is a Go package in `apps/agent/internal/modules/<category>/<name>`, with a manifest, idempotent named steps, a unit test and a staging test, plus its entry in `packages/shared/src/catalog` and its documentation page on the site. Read [`docs/contracts/service-catalog.md`](./docs/contracts/service-catalog.md) and the `agent-modules` guide in `.claude/skills/agent-modules/SKILL.md`, and start from the closest existing module.

## Contributing with an AI agent

Most of Pupitre's code is written by AI coding agents and reviewed by a human; that is welcome here too. `CLAUDE.md`, `AGENTS.md`, the workspace guides and the skills under `.claude/skills/` are the instructions those agents follow, so an agent working in this repository already knows the rules. You stay responsible for what you submit: read the diff, run it, and make sure the tests prove what the pull request claims.

## Releases

Maintainers cut releases from `staging`: `scripts/release.sh` writes the version and the release notes, the tag builds, signs and publishes the app and the agent, and the same run merges `staging` into `main`. Contributors never need to do any of this. See [`docs/monorepo.md`](./docs/monorepo.md).
