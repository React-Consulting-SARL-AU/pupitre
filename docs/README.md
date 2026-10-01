# Documentation

Everything an agent must read before touching the code, and everything the project owner must keep up to date. The documents are the specification; the code follows them.

## Map

| Document | What it contains | Who reads it |
| --- | --- | --- |
| [`product/PRODUCT.md`](./product/PRODUCT.md) | The product, the targets, the free offer and the licence, the voice | everyone |
| [`product/DESIGN.md`](./product/DESIGN.md) | The monochrome design system: tokens, rules, implementation | site, web, desktop |
| [`architecture.md`](./architecture.md) | The components, the runtimes, the boundaries, the rules that do not move | everyone |
| [`monorepo.md`](./monorepo.md) | Tooling: Bun, Turbo, Biome, hooks, CI, Cloudflare Builds, secrets | everyone |
| [`deploy.md`](./deploy.md) | Going live, step by step: Cloudflare, D1, R2, Stripe, GitHub Actions | the owner |
| [`runbook.md`](./runbook.md) | A production incident: an onboarding that dies, "Licence requise", a failed release, a lost mail, a fail2ban ban, a lost sudo password or lost devices | the owner |
| [`desktop.md`](./desktop.md) | The desktop app from the inside: channels to the agent, SSH and keys, account, updates, transfers, file layout | desktop |
| [`security.md`](./security.md) | Threat model with no code secrecy, licence, tokens | web, desktop, agent |
| [`legal.md`](./legal.md) | The publisher, the code's licence, the published legal pages, what remains to be filled in | everyone |
| [`contracts/agent-protocol.md`](./contracts/agent-protocol.md) | The JSON protocol between the app and the agent, over SSH | desktop, agent |
| [`contracts/platform-api.md`](./contracts/platform-api.md) | The `/api/v1` API consumed by the console, the app and the agent | web, desktop, agent |
| [`contracts/service-catalog.md`](./contracts/service-catalog.md) | The catalogue's modules, their manifests, their fields | desktop, agent |
| [`contracts/config-migrations.md`](./contracts/config-migrations.md) | How a configuration goes from one version to the next, on the VPS and on the laptop | desktop, agent |
| [`contracts/backups.md`](./contracts/backups.md) | Encrypted backups to the customer's S3 bucket: parts, manifest, restore, `backup.*` commands | desktop, agent, web |
| [`contracts/platform-mail.md`](./contracts/platform-mail.md) | The platform's mailbox: Email Routing, mailboxes, threads, sending, attachments, real time | web |
| [`decisions/`](./decisions/) | One decision per file, up to 0018 (source available, free up to three servers). An agent that wants to "improve" a decision reads it first | everyone |
| [`tasks/`](./tasks/) | What is decided but waits on an account, a validation or an outside deadline. One file per task, deleted the day it is done | everyone |

## Writing conventions

- English, present tense, short sentences. A document says what is true, not what was considered.
- A document that contradicts another is a bug: fix both in the same pass.
- Decisions go in `decisions/`, never in a code comment.
- Dates are absolute.
