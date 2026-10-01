# Pupitre

Pupitre turns any Ubuntu VPS into a workshop for AI agents. A desktop app for macOS, Windows and Linux inspects the server you rent, hardens it, installs the services you tick — runtimes, databases, Claude Code, Codex, remote editors, Cloudflare exposure — and becomes your window onto it. A compiled Go agent, `pupitred`, runs on the server and does the work.

- Site and documentation: [pupitre.studio](https://pupitre.studio)
- Console: [app.pupitre.studio](https://app.pupitre.studio)

## Source-available, not open source

The code of this repository is public under the **Apache License 2.0 with the Commons Clause License Condition v1.0** ([`LICENSE`](./LICENSE), [`NOTICE`](./NOTICE)). The licensor is React Consulting SARL AU (Morocco).

That combination is **source-available**. It is not an open-source licence in the sense of the Open Source Initiative, and Pupitre is not "open source".

What the licence lets you do:

- read, use and modify the code, for yourself or for your company;
- build it and run it, including a platform of your own (self-hosting);
- redistribute it, modified or not, with the licence, the Commons Clause and the notices.

What it forbids — the Commons Clause:

- selling Pupitre, or a product or service whose value derives entirely or substantially from it, to third parties for a fee or other consideration. A host that charges for installing Pupitre on its servers, a paid "managed Pupitre", or a resold build of the app all fall under this.

The name Pupitre and its logo are not covered by the licence.

## Free up to 3 servers

The hosted platform, [app.pupitre.studio](https://app.pupitre.studio), is free for every organization up to **3 servers**: no card, no trial, no subscription. React Consulting SARL AU pays for the hosting.

Beyond 3 servers, an organization needs a licence. Licences are granted on request today — write to `support@pupitre.studio`. No payment is taken.

## Repository

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

docs/            product, architecture, contracts, decisions (in French)
```

## Build and run

Bun only (the version is pinned in `package.json`), Node 22 or later, and Go 1.26 or later for the agent.

```bash
bun install
bun dev                 # site on :4321, console on :3000
bun run dev:desktop     # the desktop app, pointed at the local console
bun run build:agent     # pupitred, every architecture

bun run lint
bun run check:types
bun run test
bun run build
```

No account, secret or paid service is needed: `bun dev` first runs `dev:prepare`, which writes `.env.local` from [`.env.example`](./.env.example), generates the per-machine secrets and creates the local database. What needs a shared secret (mail, social sign-in, storage) stays off; maintainers fill those values from 1Password. The agent is tried on a disposable server in a container, never on a machine you care about.

The full guide — prerequisites, every part of the project, the test server, the checks — is [`docs/getting-started.md`](./docs/getting-started.md).

## Read next

- [`docs/README.md`](./docs/README.md) — the map of the documentation
- [`docs/architecture.md`](./docs/architecture.md) — the rules that never move: the customer's server is the source of truth, no private key leaves the laptop, no inbound connection to the server
- [`CLAUDE.md`](./CLAUDE.md) — the rules of the monorepo and the way work is done here

## Contributing

Issues and pull requests are welcome — read [`CONTRIBUTING.md`](./CONTRIBUTING.md) first. Pull requests go to `staging`, never to `main`, and a contribution is accepted under the licence of the repository, as section 5 of the Apache License states. Everyone taking part follows the [code of conduct](./CODE_OF_CONDUCT.md).

- Questions and help: [`SUPPORT.md`](./SUPPORT.md)
- Security vulnerabilities, never in public: [`SECURITY.md`](./SECURITY.md)
