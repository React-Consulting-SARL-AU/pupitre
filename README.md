<p align="center">
  <img src="./apps/site/public/icon-192.png" alt="Pupitre" width="96" height="96">
</p>

<h1 align="center">Pupitre</h1>

<p align="center">
  <strong>Your AI agents get a machine of their own. Your laptop cools down.</strong>
</p>

<p align="center">
  A desktop app that turns any Ubuntu VPS into a workshop for Claude Code, Codex and your projects — set up in minutes, without typing a command.
</p>

<p align="center">
  <a href="https://pupitre.studio/download/?ref=github"><strong>Download the app</strong></a> ·
  <a href="https://pupitre.studio/?ref=github">Website</a> ·
  <a href="https://pupitre.studio/docs/?ref=github">Documentation</a> ·
  <a href="https://pupitre.studio/integrations/?ref=github">What it installs</a>
</p>

<p align="center">
  <a href="https://github.com/React-Consulting-SARL-AU/pupitre/releases/latest"><img src="https://img.shields.io/github/v/release/React-Consulting-SARL-AU/pupitre?label=release&color=black" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/macOS%20·%20Windows%20·%20Linux-black" alt="macOS, Windows, Linux">
  <img src="https://img.shields.io/badge/free-up%20to%203%20servers-black" alt="Free up to 3 servers">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/licence-Apache%202.0%20%2B%20Commons%20Clause-black" alt="Licence"></a>
</p>

---

## Why

A laptop is a bad place for an agent to work. It sleeps, it throttles, it runs out of memory halfway through a build, and every agent stops the moment you close the lid. Parallel worktrees, headless browsers and three projects building at once make it worse.

The answer is a Linux server of your own, always on, reachable over SSH. Setting one up properly — a user that is not root, a firewall, runtimes, databases, tmux, a tunnel, the agents themselves — takes an evening, and keeping it right takes more. Pupitre does it for you, then stays as your window onto the machine.

## What you get

- **A server set up for you.** Pupitre inspects the VPS you rent, says what fits and what is missing, hardens it, and installs what you tick.
- **Your agents, working while you sleep.** Claude Code, Codex, Gemini, OpenCode and others run on the server, in the right folder, with the project's context and skills — on your own subscriptions.
- **Your projects as URLs.** Add a project by git URL or folder: Pupitre clones it, installs its dependencies, starts it, exposes it and shows its logs.
- **Databases, runtimes and tools from a catalogue.** Versions, settings and updates handled; uninstall in one click.
- **Your editor, unchanged.** VS Code, Cursor, Zed and the JetBrains IDEs open the server's folders as if they were local. The Claude and ChatGPT apps reach the server too.
- **Terminals, backups, access control** — and when something fails, the app shows the button that repairs it.

## How it works

1. [Create an account](https://pupitre.studio/?ref=github) — an email is enough.
2. [Download the app](https://pupitre.studio/download/?ref=github) for macOS, Windows or Linux and link it to your account.
3. [Rent a VPS](https://pupitre.studio/docs/start/vps/?ref=github) anywhere — Hetzner, netcup, OVH, Scaleway, DigitalOcean… Ubuntu 22.04 or 24.04, 4 GB of RAM.
4. Give the app its address, tick what you want, and watch it work.

Under the hood, the app talks to `pupitred`, a compiled Go agent it installs on the server.

## What Pupitre promises

- **We never connect to your server.** Your laptop talks to it, never the other way round; no inbound connection from the platform, ever.
- **Your keys never leave your computer.** The SSH key is made on your laptop, and we hold no copy.
- **Your code and conversations never go through Pupitre.** Agents talk to the model provider you chose, on your account.
- **The machine stays yours.** Full rights, install anything, log in without the app. If you leave, the server keeps running as a normal server.

More on the [security page](https://pupitre.studio/security/?ref=github).

## Free up to 3 servers

The hosted platform is free for every organization up to **3 servers**: no card, no trial, no time limit, and the whole catalogue included — there is no paid edition. [React Consulting](https://react-consulting.ma), which sponsors Pupitre, pays for the hosting.

Beyond 3 servers, an organization needs a licence, granted on request at `support@pupitre.studio`. No payment is taken.

## Source-available, not open source

The code is public under the **Apache License 2.0 with the Commons Clause License Condition v1.0** ([`LICENSE`](./LICENSE), [`NOTICE`](./NOTICE)), licensed by React Consulting SARL AU (Morocco). That makes Pupitre source-available — not "open source" in the sense of the Open Source Initiative.

You can:

- read, use and modify the code, for yourself or your company;
- build it and run it, including a platform of your own (self-hosting);
- redistribute it, modified or not, with the licence, the Commons Clause and the notices.

You cannot sell Pupitre, or a product or service whose value derives entirely or substantially from it — a host charging for a Pupitre installation, a paid "managed Pupitre", or a resold build of the app.

The name Pupitre and its logo are not covered by the licence.

## Build from source

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

Read next:

- [`docs/README.md`](./docs/README.md) — the map of the documentation
- [`docs/architecture.md`](./docs/architecture.md) — the rules that never move: the customer's server is the source of truth, no private key leaves the laptop, no inbound connection to the server
- [`CLAUDE.md`](./CLAUDE.md) — the rules of the monorepo and the way work is done here

## Contributing

Issues and pull requests are welcome — read [`CONTRIBUTING.md`](./CONTRIBUTING.md) first. Pull requests go to `staging`, never to `main`, and a contribution is accepted under the licence of the repository, as section 5 of the Apache License states. Everyone taking part follows the [code of conduct](./CODE_OF_CONDUCT.md).

- Questions and help: [`SUPPORT.md`](./SUPPORT.md)
- Security vulnerabilities, never in public: [`SECURITY.md`](./SECURITY.md)
