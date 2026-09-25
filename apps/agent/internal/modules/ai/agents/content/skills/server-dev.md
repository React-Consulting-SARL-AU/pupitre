---
name: server-dev
description: Drive this development server — register, start, diagnose a project, read its logs, and the conventions a start command has to respect. Load it as soon as it is a matter of adding, configuring, launching or troubleshooting a project of the stack.
---

This server carries every development project, and `dev` is the only way to
drive them. Launching a `bun run dev` by hand duplicates the process and blocks
the port for everyone; the command exists to avoid that.

## Seeing what runs

    dev status              readable view: state, ports, services
    dev status --json       the same, machine-readable
    dev snapshot            machine + services + projects, in one round trip
    dev top                 the processes that weigh, attributed to their project
    dev logs <project>      the last lines    (-f to follow)
    dev sessions            the agents and IDE backends hanging around

A project has a `state` among: `online` (the port answers), `starting` (the
window exists, the port not yet), `failed` (the log carries an error), `stopped`,
`service` (systemd), `external` (the port answers without `dev` having started
it), `down`.

Only conclude "it does not work" after reading `dev logs <project>`: a project
that has been `starting` for ten seconds is simply compiling.

## Starting, stopping

    dev up <project>        dev up all
    dev down <project>      dev restart <project>

Nothing starts by itself when the machine boots: that is deliberate, development
environments saturate the RAM as they pile up.

## One repository, several processes

A single repository often carries several services: an app and its mail preview,
an API and its client. Each is one row of the registry, and the first segment of
its folder groups them — that is the `group` field of `dev status --json`, there
is no column to fill in for it.

The first row carries the repository URL; the following ones carry `-`, since the
clone is already done.

Only register what has to run permanently. A tool you open on demand — a render
studio, a generator — is launched in a terminal, it has no business in the
registry.

## Adding a project

The row arrives on standard input, in registry format, eight fields separated by
`|`:

    name|dir|repo|pkgmgr|host|port|subdomain|command

    echo 'my-site|my-site|https://github.com/…|bun|127.0.0.1|4400|my-site|bun run dev --host 127.0.0.1 --port 4400' \
      | dev project add

The command checks the uniqueness of the name, the port and the subdomain, clones
the repository (or creates the folder if the field is `-`), and regenerates the
tunnel. Then:

    dev sync <name>            installs the dependencies
    dev project remove <name>  removes it from the registry, the folder stays

`pkgmgr` is `bun`, `pnpm`, `npm`, `gradle`, `service` or `none`. `subdomain` at
ONE single level, or `-` not to publish it.

## The conventions, and why they hold

They exist so that one more project needs no particular configuration. Before
registering a project, check that its command respects them.

**Listen on 127.0.0.1.** No invented `.localhost` domain: a unique port is enough
to keep two services apart, and the tunnel rewrites the `Host` header anyway. If
a repository freezes a hostname in its `package.json`, put that hostname in the
registry's host column — the stack points it at 127.0.0.1 in `/etc/hosts`.

**Serve over http.** No project serves TLS here. A dev server on https attacked
over http returns a 502 without a line in its logs — it never saw the request.

**Pin the port on the command line**, not in the project's configuration file:
the registry stays the single source of truth, and the repository is not
modified. Depending on the tool:

| Tool | How |
|---|---|
| Vite, Astro | `--host 127.0.0.1 --port N` **at the end** — the last occurrence wins, which leaves the repository's script intact |
| Next.js | `next dev -H 127.0.0.1 -p N` |
| Nuxt | `NUXT_HOST=127.0.0.1 NUXT_PORT=N` |
| Remix, SvelteKit | `--host 127.0.0.1 --port N` |
| Spring Boot, Grails | `SERVER_PORT=N` **in front of** the command — Spring reads it before `application.yml`, without touching the repository |
| Rails | `bin/rails s -b 127.0.0.1 -p N` |
| Django | `python manage.py runserver 127.0.0.1:N` |
| Wrangler, Cloudflare | `--port N` passed to the workspace, not to turbo, which would take the option for its own |
| Expo, React Native | nothing to register: it makes no sense without a device |

**Beware of the client's `/api` proxy.** Many single-page apps hard-code their
proxy target in `vite.config.ts`. The API's port is then not free: it is dictated
by the client. Getting it wrong breaks nothing visibly — the page loads, then
every call returns 502. Read the client's `vite.config.ts` before choosing its
API's port.

**One port per service, and it is checked.** The registry refuses a project on a
port another project already holds, or two processes of one project on the same
port, before anything is written; a clash with another project comes with a free
port to use instead.

## Secrets

    dev secrets --json        the state of the keys, never their value
    printf '%s' "$V" | dev secrets set <KEY>

The value goes through standard input, never as an argument: an argument is
readable in `ps` by anyone on the machine. A project's secrets come from the
machine's secret manager (`dev secrets <project>`), never from a committed file.

## The rest

    dev branch <project> <name>   switch branch
    dev branches <project>        its branches, as JSON
    dev kill <pid>                stops a process (refuses what carries the session)
    dev tunnel sync               regenerates the routes after a registry change
    dev doctor                    quick diagnosis
    dev help                      everything else
