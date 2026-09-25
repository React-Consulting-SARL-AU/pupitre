---
name: server-dev
description: Drive the projects of this development server with `dev` — see what runs, start and stop, read the logs, sync a repository, reach the local database, check backups — and the rules a start command, a port and a host have to respect. Load it as soon as it is a matter of running, configuring or troubleshooting a project here, or of anything that would need root.
---

This server carries every development project, and `dev` is the only way to
drive them. A `bun run dev` launched by hand duplicates the process and holds the
port; `dev` starts each process in its own tmux window, with its log.

Every `dev` command takes `--json`.

## Seeing what runs

    dev status                          projects, processes, ports, services
    dev status --json                   the same, machine-readable
    dev logs <project> [process]        the last lines of a process's log
    dev logs <project> [process] -f     follow it
    dev logs <project> [process] -n 300 more lines
    dev doctor                          a short diagnosis of the machine

Without a process, `dev logs` reads the project's first one.

A process is `online` (its port answers), `starting` (its window exists, the port
not yet), `failed`, `stopped`, `down`, `external` (the port answers but `dev`
did not start it) or `service` (systemd owns it). A project whose processes do not
all run is `partial`.

Read `dev logs` before concluding that something is broken: a project `starting`
for ten seconds is usually still compiling.

## Starting, stopping

    dev up <project> [process]          dev up all
    dev down <project> [process]        dev down all
    dev restart <project> [process]     dev restart all

`all` leaves `service` processes alone: systemd runs them. Nothing starts with
the machine unless the owner asked for it in the Pupitre app.

## Repositories

    dev sync <project>                  git pull, then the dependencies
    dev branch                          each project's current branch
    dev branch <project>                its local branches
    dev branch <project> <branch>       switch to that branch
    dev attach <project> [process]      prints the tmux command that opens its window

## Registering a project

The project registry belongs to root and to the agent: never edit it. `dev` cannot add, change or remove a project. Ask the owner
to do it from the Pupitre app, which detects the processes, the package manager,
the start command and the port of a repository, and refuses a port already held
with a free one to use instead. Give them what they need: the repository, each
process's folder, command and port.

A project lives in `~/projects/<dir>`. One repository can carry several
processes (an app and its API, a site and its mail preview): one project, one
process each, each on its own port. Register only what must run permanently; a
tool opened on demand runs in a terminal.

## Rules for a start command

**Listen on 127.0.0.1**, or on the `<name>.localhost` host the repository's
script insists on: the agent writes that name into `/etc/hosts`. No other host is
accepted.

**One port per process, between 1024 and 65535**, free across every project.
Pin it on the command line, not in the repository's configuration, so the
registry stays the only source of truth:

| Tool | How |
|---|---|
| Vite, Astro, Remix, SvelteKit | `--host 127.0.0.1 --port N` **at the end** — the last occurrence wins |
| Next.js | `next dev -H 127.0.0.1 -p N` |
| Nuxt | `NUXT_HOST=127.0.0.1 NUXT_PORT=N` in front |
| Spring Boot, Grails | `SERVER_PORT=N` in front |
| Rails | `bin/rails s -b 127.0.0.1 -p N` |
| Django | `python manage.py runserver 127.0.0.1:N` |
| Wrangler | `--port N` given to the workspace, not to turbo |

**Serve plain http.** The tunnel in front terminates TLS; a dev server on https
answers the tunnel with a 502 and logs nothing.

**Mind a client's `/api` proxy.** A single-page app often hard-codes its API's
port in `vite.config.ts`; that port is then imposed. Getting it wrong shows as a
page that loads and API calls that all fail with 502.

**Public addresses** are routes of the registry, `<subdomain>.<server domain>`,
set by the owner in the app; the tunnel only publishes those.

## Secrets

A project's `.env.local` is written by the agent from `.env.1password.tpl`
(through 1Password, when the owner installed it) or copied from `.env.example`.
Never commit it, never print a secret, never put one on a command line: `ps`
shows arguments to everyone on the machine.

## Databases

    dev db url [engine]                 the local database's address, without its password
    dev db shell [engine]               the command that opens a client on it

`engine` is `mysql`, `postgres` or `mongodb`, and can be left out when only one
is installed. `dev db dump` and `dev db import` are privileged (see below).

## Backups

    dev backup status                   when the last backup ran, and how it went

When the owner configured them, backups cover the configuration, the databases
and the `dev` account, projects included, encrypted into the owner's own bucket.
`dev backup now` is privileged. Never delete, move or edit anything a backup
needs; restoring is done from the Pupitre app.

## Root, sudo and SSH keys

- `dev` has no passwordless sudo, except two exact commands the agent itself
  uses. Everything else asks for the `dev` password, which you do not have and must not look for. A
  server the owner has not moved to this rule yet still lets sudo through without
  a password: do not use it there either.
- `dev db dump`, `dev db import` and `dev backup now` open a privileged session:
  sudo asks the password on the terminal, and without a terminal they refuse. Do
  not work around it. Hand the command to the owner.
- Anything that needs root — packages, system services, firewall, installing a
  database or a runtime — goes through the owner and the Pupitre app. Say what is
  needed and why, then stop.
- Never touch `~/.ssh/authorized_keys`: its marked block is managed by the
  agent, and a key only enters it through an approval signed from one of the
  owner's devices. Never add a key anywhere else in that file either.
- Never read or write the agent's own files: its configuration, its state and
  its binary belong to root.
