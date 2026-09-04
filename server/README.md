# Pupitre — the server (dev-stack)

> LEGACY — cette stack bash est la spécification des modules de l'agent Go (voir [docs/contracts/service-catalog.md](../docs/contracts/service-catalog.md)). Elle n'est plus le chemin d'installation du produit.

Turn a bare Ubuntu into a complete development server, driven from your laptop.
You open your laptop, your dev servers are already running, your URLs answer, and
the AI agents work on the machine that has the RAM.

---

## Contents

1. [What the stack does](#1-what-the-stack-does)
2. [Installation](#2-installation)
3. [Day to day](#3-day-to-day)
4. [Adding a project](#4-adding-a-project)
5. [The dashboard](#5-the-dashboard)
6. [Images produced by agents](#6-images-produced-by-agents)
7. [Editing the server's files from your laptop](#7-editing-the-servers-files-from-your-laptop)
8. [Under the hood](#8-under-the-hood)
9. [Troubleshooting](#9-troubleshooting)
10. [Security](#10-security)
11. [Folder layout](#11-folder-layout)

---

## 1. What the stack does

| Piece | Choice | Required? | Why |
|---|---|---|---|
| Access | **SSH**, keys only | yes | A single open port; everything else comes back through the SSH session |
| Processes | **tmux** | yes | One window per project, surviving disconnection |
| Runtimes | **mise** — Node, Bun, pnpm and Java | yes | One tool for all four: one fewer dependency that can break |
| Driving | **`dev`** and **`dev tui`** | yes | One command, or a full-screen dashboard |
| Agents | **Claude Code** and **Codex** on the server | yes | They run where the CPU, the RAM and the files are |
| Images | **`shot`** + gallery | yes | Agent screenshots visible from your laptop |
| Web exposure | **Cloudflare Tunnel** | **no** | One tunnel, one route per project, valid HTTPS, nothing to open. Without it: the ports, through `ssh -L` |
| Database | **MySQL 8** (or MariaDB) | **no** | `root@localhost` on socket for admin, `root@127.0.0.1` for the apps, a named account for your workstation |
| Secrets | **1Password CLI**, service account | **no** | Headless, revocable token |
| Repositories | **GitHub** (`gh`) | **no** | HTTPS clone with no key, and the server's key registered on the account. Elsewhere: the SSH key is enough |
| Remote database | **Neon** | **no** | Only for repositories that provision a branch |

### The machine profile

**Nothing but the SSH public key is required.** A machine with no database, no
tunnel, no secret manager and no host account is still a machine `bootstrap.sh`
installs and `dev` drives. It does fewer things, and nothing lies.

| Setting | Values | What `auto` means |
|---|---|---|
| `DATABASE_ENGINE` | `mysql` · `mariadb` · `none` · `auto` | `mysql` if `MYSQL_APP_PASSWORD` is filled in |
| `TUNNEL_PROVIDER` | `cloudflare` · `none` · `auto` | `cloudflare` if all three `CLOUDFLARE_*` are |
| `SECRETS_PROVIDER` | `1password` · `none` · `auto` | `1password` if `OP_SERVICE_ACCOUNT_TOKEN` is |
| `GIT_PROVIDER` | `github` · `git` · `auto` | `github` if `GITHUB_TOKEN` is |
| `NEON_ENABLED` | `yes` · `no` · `auto` | `yes` if `NEON_API_KEY` is |
| `STACK_SERVICES` | `key:label:unit …` | derived from the first four |

`auto` — the default — derives each service from what is filled in: an existing
installation therefore keeps exactly the behaviour it had, with not a line to
add. `none` disables outright, even when the variables are filled in.

Once resolved, this profile is written to `/etc/dev-stack.public.env`. That is
what `dev`, `dev-diag` and Pupitre read: `dev snapshot` returns the list of
services the machine declares, and the app shows what it finds there without
knowing anything about Cloudflare or MySQL.

```bash
# a machine that exposes nothing and has no local database
DATABASE_ENGINE=none
TUNNEL_PROVIDER=none

# a machine that runs something else
STACK_SERVICES="database:Database:postgresql queue:Queue:redis"
```

Without a tunnel, the registry's "subdomain" column is ignored and every project
is reached on its port, through the SSH tunnel Pupitre already opens. Without a
local database, `dev db` says so instead of failing. Without a secret manager, a
repository that versions a `.env.1password.tpl` falls back on its `.env.example`.

---

## 2. Installation

> For a step-by-step walkthrough that starts before this — choosing a
> distribution, making an SSH key, the very first connection — read
> [`docs/SETUP.md`](../docs/SETUP.md). This section is the reference.

The script is designed to go all the way through **even when things fail**. A
failing step is recorded and the script continues; at the end, a report lists what
went wrong with the exact command to replay it. You see every problem at once,
not one every ten minutes.

### 2.1 — What you need at hand

**The server image**: Ubuntu 24.04 LTS (Debian works too, with MySQL coming from
the Oracle repository). 8 GB of RAM minimum, more as soon as a JVM is involved.

**Your SSH public key.** Only the public part has to be placed on the server:

```bash
# from your own machine, on a fresh box that still accepts a root password
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@203.0.113.10
ssh root@203.0.113.10 'hostname'
```

If your private key lives in a password manager whose agent presents it (1Password,
for instance), it is not on disk — `ssh-copy-id` then needs `-f`:

```bash
ssh-copy-id -f -i ~/.ssh/dev-vps.pub root@203.0.113.10
```

**The tokens**, depending on what the machine has to do. None is required in
itself: a missing token disables its service, it does not fail the installation.

| What | Where | Permissions | Without it |
|---|---|---|---|
| Cloudflare | [profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) | Tunnel: Edit · DNS: Edit · Access Apps: Edit | no public URL; the ports, through `ssh -L` |
| Cloudflare IDs | the zone's overview page, bottom right | Account ID + Zone ID | same |
| GitHub | [settings/tokens](https://github.com/settings/tokens) | `repo`, `read:org`, `admin:public_key` | clone via the server's SSH key, to be added to your account |
| 1Password | my.1password.com → Developer Tools | service account, read on the vault | `.env.local` to complete by hand |
| Neon | [settings/api-keys](https://console.neon.tech/app/settings/api-keys) | — | no Neon branch provisioned |

`bootstrap.sh --check` says exactly what is missing for the services you asked
for, and nothing about the others.

### 2.2 — Your configuration, from your own machine

Your tokens live in **one local file**, `mac/secrets.env`, ignored by git. A
script sends it to the server. No more typing into `nano` over SSH, and
reinstalling the server costs one command.

```bash
cd pupitre/server/mac
./push-secrets.sh --edit --host 203.0.113.10   # creates secrets.env from env.example, opens it
./push-secrets.sh --host 203.0.113.10          # sends it to /etc/dev-stack.env
```

Before sending, it checks that `SSH_PUBLIC_KEY` is filled in and refuses outright
if you pasted a **private** key instead of the public one.

`--pull` fetches the server's version to compare, `--user dev` is what you want
after SSH hardening, when root no longer connects.

### 2.3 — The server

```bash
# first transfer of the stack folder
scp -r pupitre/server root@203.0.113.10:/opt/dev-stack
ssh root@203.0.113.10

cd /opt/dev-stack && chmod +x bootstrap.sh bin/* && ./bootstrap.sh
```

If you already sent your configuration (§2.2) it carries straight on. Otherwise it
creates `/etc/dev-stack.env` and stops so you can fill it in.

```bash
./bootstrap.sh --check     # tests your tokens, installs nothing
./bootstrap.sh             # 15 to 25 minutes
```

`--check` makes a real call to every API: an invalid Cloudflare token or a wrong
Zone ID shows up in five seconds, before any installation.

At the end, the report tells you what runs, what failed, and how to replay each
failed step:

```bash
./bootstrap.sh --only=database      # replay one step
./bootstrap.sh --list               # the list of steps
```

The script is **idempotent**: rerun it entirely as often as needed, it skips what
is already done.

> **The root login is only closed at the very last step**, and only if a key
> really does authorise the `dev` user. After that you connect as
> `dev@203.0.113.10`, and `/opt/dev-stack` needs a `sudo` to write:
>
> ```bash
> scp bootstrap.sh dev@203.0.113.10:~/
> ssh dev@203.0.113.10 'sudo install -m 755 ~/bootstrap.sh /opt/dev-stack/'
> ```

### 2.4 — Your own machine

```bash
cd pupitre/server/mac
./setup-mac.sh --host 203.0.113.10
```

It detects a 1Password agent if there is one, writes a `Host` block into
`~/.ssh/config` (multiplexing, database and debugger forwarding), lays down the
Ghostty configuration if Ghostty is installed, and the shell aliases. What it
learns is remembered in `~/.dev-stack/target.env`, so a rerun does not ask again.

This script is macOS-specific. **On Linux or Windows, write the `Host` block by
hand** — that is all Pupitre needs:

```
Host my-server
    HostName 203.0.113.10
    User dev
    IdentityFile ~/.ssh/id_ed25519
    ControlMaster auto
    ControlPath ~/.ssh/cm-%r@%h:%p
    ControlPersist 10m
    LocalForward 3307 127.0.0.1:3306
```

### 2.5 — Validate ONE project before all of them

The most expensive lesson of this whole thing: do not launch ten services at
once. Validate the full chain on the simplest one.

```bash
vps                              # you are on the server
dev up my-site
dev status                        # should read "online"
```

Then open its URL.

| What you see | Where the problem is |
|---|---|
| The page renders | The whole chain works — add the others |
| **502** | The dev server is not listening: `dev logs my-site` |
| It stops on a missing variable | No `.env.local`: `dev env my-site` |
| **1033** | The tunnel: `dev-diag` tells you whether it is DNS or cloudflared |
| A certificate error | A multi-level subdomain slipped into `projects.conf` |

Once that page renders, the rest is repetition:

```bash
dev up all
```

When something breaks, **one command** produces everything needed to understand
it — the tunnel's real identity, a comparison of each DNS record against that
identity, the listening ports, an HTTP test of every origin, cloudflared's log:

```bash
dev-diag
```

### 2.6 — Databases

Put your dumps in the stack's **`db/`** folder. They are imported automatically,
one database per file, the database name derived from the file name:

```
db/fulldump_shop_202608121250.sql     →  database shop
db/dump_intranet_202603181730.sql     →  database intranet
```

`.sql.gz` files are accepted, and a dump already imported is never replayed.

**Transfer them with `./deploy.sh --db`** (or `rsync`), not with `scp -r`: they
can weigh hundreds of megabytes, and rsync only sends what changed.

To update the stack, one command from your own machine:

```bash
cd pupitre/server/mac
./deploy.sh                  # sends and reinstalls the tooling
./deploy.sh tunnel           # … and replays the tunnel step
./deploy.sh --all            # replays everything
./deploy.sh --diag           # sends, then prints the diagnosis report
```

It fixes the remote folder's permissions along the way, excludes the dumps and
`secrets.env`, and restores the executable bits.

#### Connecting from your own machine

**The database is exposed nowhere**: `ufw` only opens port 22, and the engine
binds to `127.0.0.1`. Everything goes through the SSH tunnel.

The `Host` block laid down by `setup-mac.sh` carries a
`LocalForward 3307 127.0.0.1:3306`: as long as an SSH session is open, the
server's database answers on `127.0.0.1:3307` of your machine. That is what
TablePlus and DBeaver expect — host `127.0.0.1`, port **3307**, the user and
password from your configuration.

IntelliJ and DataGrip can open the tunnel themselves, which needs neither the
`LocalForward` nor an open SSH session: in the data source, tab **SSH/SSL** →
*Use SSH tunnel*, authentication type **OpenSSH config and authentication
agent**. Then, in **General**, host `127.0.0.1` and port `3306` — those are the
coordinates seen *from the server*, at the tunnel's exit. That is the classic
mistake: putting the public IP or port 3307 there makes the connection fail.

---

## 3. Day to day

All these commands work **on the server** and **from your own machine** — the
`dev()` function laid down by `setup-mac.sh` relays them over SSH.

```bash
dev tui                     # the full-screen dashboard
dev status                  # what runs, ports, URLs

dev up my-site              # start a project
dev up all
dev down my-api
dev restart my-site

dev attach my-site          # watch the output live (Ctrl-b d to leave)
dev logs my-site -f         # or follow the log, without tmux

dev sync                    # git pull + install everywhere
dev sync my-site

dev branch                  # each repository's branch
dev branch my-site          # the available branches
dev branch my-site main     # switch to it — created if missing

dev debug my-api            # restart with the JVM debug agent
dev debug my-api off        # back to a normal start

dev secrets my-site         # resynchronise the project's secrets
dev env my-site             # (re)generate the .env.local
dev env all
dev db shell | dump | import <file>
dev shots list | clean
dev doctor
dev reboot                  # reboots the server to free RAM
```

**Rebooting the machine** is a mundane operation here, and sometimes the most
effective one: after a few days, the JVMs, the Vite watchers and the page cache
have eaten the RAM, and nothing gives it back. `dev reboot` shows the memory
state, names the projects that will go down and the command to restart them, then
asks for confirmation.

Nothing important lives on this machine — the code is in git, managed databases
at their host, the secrets in your secret manager. Only the local database and
the caches are local, and the database is stopped cleanly by the system.

**A typical day:**

```bash
vps            # or nothing at all: the servers are already running
dev sync       # pull what you pushed from your laptop
vclaude my-site
```

You restart nothing after rebooting your laptop: the tmux sessions live on the
server. After rebooting the *server*, one `dev up all` is enough.

### Authenticating Claude Code on the server

`vclaude my-site` opens Claude Code **on the server**, in a tmux window: the
agent reads and writes the server's files, and its session survives closing your
terminal. It still has to be signed in to your account — and a server has no
browser to open the authorisation page.

Hence `claude setup-token`, to be run **on your own machine**, once. It does the
OAuth in your browser and prints a long-lived token backed by your subscription —
no usage billing:

```bash
claude setup-token          # on your machine; copy the token it prints
```

Then fill it in like the other secrets, and send it back to the server:

```bash
cd pupitre/server/mac
./push-secrets.sh --edit    # paste it into CLAUDE_CODE_OAUTH_TOKEN
./push-secrets.sh
ssh my-server 'sudo /opt/dev-stack/bootstrap.sh --only=user'
```

It really is the **`user`** step, not `secrets`: the first writes the environment
of the dev user's shells, the second only authenticates the provisioning tools
(op, gh, neonctl). It drops the token into `~/.config/dev-stack.env`, which
`~/.zshenv` sources for **every** shell on the server — including the tmux windows
`dev claude` opens. Check with:

```bash
ssh my-server 'claude auth status'
```

Two details that save surprises. The token **is access to your account**: keep it
in your password manager, and know that `claude auth logout` on your laptop does
not revoke it — that is done from your Anthropic account settings. And if you
prefer usage billing, `ANTHROPIC_API_KEY` replaces this token: fill in one **or**
the other, never both.

Without a token, nothing is lost: `vclaude <project>` then `/login` inside the
session shows a URL to open on your laptop and a code to paste back. It works,
but it has to be redone, whereas the token holds.

### Agent skills

What Claude Code and Codex can do on this machine is not decided inside a
session: the stack lays it down, for every agent at once, at the `skills` step of
`bootstrap.sh`.

A single folder is authoritative, `~/.agents/skills` — Codex reads it as is, and
Claude Code finds one symlink per skill in `~/.claude/skills`. The machine context
and the code preferences (`agents/preferences.md`) are written, identically, to
`~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`.

| Skill | What it does | From |
|---|---|---|
| `server-dev` | drive the projects with `dev`, port and command conventions | `agents/skills/` |
| `ship` | commit and push on the current branch, message in the repository's convention | `agents/skills/` |
| `branch` | create a branch, commit, push | `agents/skills/` |
| `pr` | open a pull request with `gh` | `agents/skills/` |
| `capture` | capture a page or drop an image with `shot`, check the rendering, embed the URL in the answer | `agents/skills/` |

Claude Code additionally receives the `git-shipper` subagent (`agents/agents/`),
which `ship` and `branch` delegate to.

Third-party skills are declared in `agents/external-skills.conf`, one source per
line; `npx skills update` updates them on the server. To add your own skill: a
folder in `agents/skills/` with its `SKILL.md`, then `./deploy.sh skills`.

### The shell integration

`bin/pupitre.zsh`, laid down as `/etc/dev-stack.integration.zsh` and sourced by
`~/.zshrc`, makes the shell tell the terminal where the prompt starts, where input
starts, when the command leaves and which folder we are in (the OSC 133 and OSC 7
sequences). That is what lets Pupitre read the line being typed and offer
completion — the grammar of `dev` (`dev completions`), the history, the paths —
without ever guessing from the display. Ghostty, Kitty and VS Code understand the
same sequences; a terminal that does not know them ignores them.

---

## 4. Adding a project

Everything starts from **`projects.conf`** — cloning, dependencies, tmux, tunnel,
DNS. One line per service:

```
name|dir|repo|pkgmgr|host|port|sub|cmd
```

The file itself documents each column and carries commented examples. Once a line
is added:

```bash
sudo /opt/dev-stack/bootstrap.sh --only=tunnel,projects
dev up my-site
```

DNS, the tunnel route and the clone are created along the way.

From a terminal — which is what lets an agent create a project that shows up in
Pupitre with nothing more:

```bash
echo 'my-site|my-site|https://github.com/me/my-site|bun|127.0.0.1|4400|my-site|bun run dev --port 4400' \
  | dev project add
```

That goes into `/etc/dev-stack.projects.local.conf`, which deployment never
touches. On equal names the local file wins — which is how you fix a port without
touching the repository.

For the `cmd` column, prefer a script that already exists in the project's
`package.json` over a recomposed command: that is what keeps the server aligned
with what you do locally. And keep the `sub` values at **one single level**,
prefixed with the project name, so as never to collide with a production record
of the zone.

---

## 5. The dashboard

`dev tui` — projects on the left, the machine on the right (CPU with a 60 s
sparkline, RAM, swap, disk, load, services, and the six heaviest processes
labelled by project). Refreshed every second.

| Key | Action |
|---|---|
| `↑` `↓` / `j` `k` | navigate |
| `s` `x` `r` | start / stop / restart |
| `A` `X` | start all / stop all |
| `⏎` | shell in the project |
| `c` `o` | Claude Code / Codex in the project |
| `l` | follow the logs |
| `y` | show the URL |
| `g` | git pull + install |
| `b` | switch the repository's branch |
| `/` `q` | filter / quit |

The **RAM** column sums each project's process tree, and turns amber past 2 GB. A
development environment grows silently — a Gradle daemon, a Vite watcher — and it
is always when the machine saturates that you go looking for which one. This
column answers the question before it is asked, and `dev reboot` is the way out
when nothing gives memory back any more.

**Nothing starts by itself.** No project is launched when the server boots: no
systemd unit, no cron, no line in a shell file. After a reboot the tmux session is
empty and it is up to you to choose what you want running — a development project
has no business eating RAM when nobody is working on it. Only the screenshot
gallery is a permanent service, because it costs nothing.

A project launched **outside `dev`** — by an IDE run configuration, for instance —
shows as "external": its port answers, so it is running, but `dev down` has no
grip on it. Its age is that of the process holding the port.

---

## 6. Images produced by agents

When an agent produces a screenshot on the server, it is on a machine you cannot
see. Hence `shot`:

```bash
shot capture.png                  # drop a file
shot https://my-site.example.dev  # capture the page (headless Chrome)
shot --list
```

It files the image under `~/shots/YYYY-MM-DD/` and **prints the public URL** —
which is an HTTPS address when the machine has a tunnel, and its local port
otherwise. The server's `~/.claude/CLAUDE.md` tells the agents to use `shot` and
to end their answer with that URL, rather than quoting a local path you cannot
open.

On your own machine:

```bash
shots            # the gallery in the browser
vps-shot -o      # brings back the latest screenshot and opens it
vps-shots        # a full mirror in ~/Pictures/vps-shots
vps-shots -w     # continuous sync
```

**`vps-shot` is the command that matters when an agent runs on your laptop**: it
brings the file back and prints its local path, so the agent can read it and show
it in the conversation.

The gallery is **public by default**. Fill in `CLOUDFLARE_ACCESS_EMAIL` in
`/etc/dev-stack.env` to restrict it to your address through Cloudflare Access
(free up to 50 users) — recommended, given what dev screens tend to contain.
Housekeeping: `dev shots clean 14`.

---

## 7. Editing the server's files from your laptop

The files live on the server; the editor stays local. **Zed**, **VS Code** and
**IntelliJ** can all do this: they install a small server on the remote machine,
run the language servers, the tasks and the terminal there, and only display the
interface on your side. No synchronisation, no network mount — so nothing to
reconcile.

All three inherit your `~/.ssh/config`, and therefore the `Host` block
`setup-mac.sh` laid down: multiplexing, the agent, everything is already there.

**Zed** — the `zed-vps` shortcut opens a project directly:

```bash
zed-vps my-site          # or any name from projects.conf
```

Without it: `zed ssh://my-server/home/dev/projects/my-site`, or use *Connect New
Server* from the project picker. Zed drops its server into `~/.zed_server` on the
first connection.

**VS Code** — install the *Remote - SSH* extension, then *Remote-SSH: Connect to
Host* → your host. Same principle, folder `~/.vscode-server`.

**IntelliJ IDEA** — the first time you have to go through the welcome screen:
*Remote Development* → *SSH* → *New Connection*, ticking *Parse config file
~/.ssh/config*. The backend then downloads into
`~/.cache/JetBrains/RemoteDev/dist`. `idea-vps <project>` discovers which backend
is installed on the server, builds the matching `jetbrains-gateway://` link and
opens it.

One difference in kind, though: where Zed lays down a light server, IntelliJ
ships **a whole IDE**, indexing included — and on a Gradle project it will also
start its own daemon. Count 2 to 4 GB per project, on top of what your services
already use. That is the item that will tip the balance first if you open several
projects at once — `dev reboot` is there for that.

A shared limitation: from the **server's** terminal, `zed` cannot open a file in
your local editor. You open the project from your laptop, and keep the remote
terminal for what it does well — `dev`, git, the agents.

---

## 8. Under the hood

**The tunnel rewrites the Host header.** Vite refuses requests whose `Host` is not
in `server.allowedHosts`. Rather than patching every `vite.config.ts`, the ingress
asks cloudflared to rewrite the header to the one the dev server already expects:

```yaml
- hostname: my-site.example.dev
  service: http://127.0.0.1:3000
  originRequest:
    httpHostHeader: 127.0.0.1:3000
```

None of your repositories needs modifying.

**The only optional patch: HMR.** The Vite client opens its WebSocket on the dev
server's port; behind a tunnel on 443 it fails and falls back to a full reload.
Three lines fix it, and it is a legitimate addition to commit:

```ts
server: {
  hmr: process.env.DEV_TUNNEL_HOST
    ? { protocol: "wss", host: process.env.DEV_TUNNEL_HOST, clientPort: 443 }
    : undefined,
}
```

Then, in the `cmd` column: `DEV_TUNNEL_HOST=… bun run dev`. Locally the variable
is absent and nothing changes.

**The machine interface.** `dev status --json` describes the projects,
`dev snapshot` adds the machine and its services — in one round trip, which is
what an interface refreshing every second needs. The readable table of
`dev status` is only a rendering of that same data; nothing should ever parse a
display meant for the eye, the slightest added column would break it.

These commands were written to be called in a loop. The state used to be built by
querying the system once per project — a `git`, a `tmux`, a `ps`, an `ss` each —
which meant 90 processes and a quarter of a second. The system is now queried once
for all of them: **19 processes, about 100 ms**. Branches are read from `.git/HEAD`
without launching git, machine statistics from `/proc`.

One last gain belongs to the caller: launching `ssh` costs nearly 200 ms on its
own, multiplexing included. An interface should therefore keep **a single ssh
process open** and write its commands into it, rather than launching one per poll
— that is half the response time.

**What "online" means.** The project's port answers, and nothing else: that is the
only signal that does not lie, since it is exactly what the tunnel will go
looking for. You still have to poll the right port — a service can sit in
perpetual "starting" because its framework listens on 8081 while the registry
announced 8080.

The probe tries **every** address of a name, IPv4 and IPv6: a dev server
listening only on v4 behind a name resolved to v6 first looked dead.

A project whose port does not answer is "starting" — unless its log carries a
terminal condition (`BUILD FAILED`, `EADDRINUSE`, `exited with code`…), in which
case it becomes "failed". The list is deliberately short: a healthy JVM log spews
`ERROR` lines continuously, and a generic marker would show "failed" on a
perfectly alive service.

**Branches.** One repository, one branch — and several projects sometimes share
the repository: an API and its client are two folders of the same clone.
`dev branch` therefore operates on the repository root, refuses to switch a dirty
tree, and names the servers to restart — otherwise they would keep serving the
previous branch's code.

**tmux.** One `dev` session, one window per project, named as in
`projects.conf`. Each window is wired to a file through `pipe-pane`: that is what
lets `dev logs` — and therefore the agents — read the errors without attaching to
the terminal. `Ctrl-b d` detaches, `Ctrl-b w` lists, `Ctrl-b [` scrolls.

**The `.env.local` files.** Your repositories do not version their secrets: they
version a `.env.1password.tpl` that `op inject` resolves from the vault. The
provisioning therefore runs, for each project, its own preparation script
(`bootstrap:local` or `dev:prepare`), and falls back on a direct injection of the
template if the project has none. Without that step, the dev server starts and
then stops on a missing variable — and the error scrolls past in a window nobody
is watching.

A single implementation does that work, **`bin/dev-env`**: the provisioning calls
it, and so does `dev env <project>`. That is what guarantees that a file
regenerated by hand is identical to the one the installation would have produced.
It also adapts the repository's local URLs to the tunnel's public URL — without
which auth libraries answer "Invalid origin". `dev-diag` lists the projects whose
file is missing.

**One origin convention: `http://127.0.0.1:<port>`.** A unique port per service is
enough to keep them apart — no dedicated hostname, no local TLS. If a repository
freezes its own hostname in its `package.json`, put that hostname in the
registry's host column: `bootstrap.sh` writes the `/etc/hosts` line that brings
every `*.localhost` host of the registry back to 127.0.0.1, once, and nobody
thinks about it again.

The stack does not trust that convention blindly, though: when writing the
ingress, it **asks each running origin** whether it speaks http or TLS, and writes
the route accordingly. A project that started serving https would therefore be
routed correctly with nothing to declare — and that is the class of failure that
costs the most, because a tunnel 502 leaves no trace in the dev server's logs,
since it never saw the request. After starting services, `dev tunnel sync` replays
the detection.

**Cloudflare credentials for the projects.** `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` are placed in `dev`'s environment, not only in the
provisioning's. wrangler looks for them before any other method; without them, a
project declaring a `remote` binding opens a browser OAuth flow, which a server
cannot finish.

Careful if the project goes through **Turbo 2**: it only exposes the variables it
is told about. They have to be named in the repository's `globalPassThroughEnv` —
`globalPassThroughEnv` and not `globalEnv`, so a credential does not enter the
cache hash.

**The firewall.** `ufw` refuses everything inbound except port 22. The database
listens, but no route reaches it from outside: you get to it by borrowing the SSH
session. The dev servers have *no* open port either — cloudflared establishes an
**outbound** connection, and the traffic comes back down through it.

**The database accounts.** `root@localhost` stays on socket authentication —
that is what makes `sudo mysql` work, hence `dev db` and dump imports.
`root@127.0.0.1` carries the password the applications expect. The named account
that serves your workstation is declared on `127.0.0.1` too.

That address is not a detail: `skip_name_resolve` makes the engine compare
addresses and never names, and a connection coming out of the tunnel presents
itself precisely as `127.0.0.1`. An account declared on the client's real address
would never be recognised.

---

## 9. Troubleshooting

| Symptom | Cause | What to do |
|---|---|---|
| `Error opening terminal: xterm-ghostty` | terminfo missing | `export TERM=xterm-256color`; durable fix in §2.4 |
| `REMOTE HOST IDENTIFICATION HAS CHANGED` | system reinstalled | `ssh-keygen -R 203.0.113.10` |
| SSH asks for a password | key with a non-standard name, not offered | `ssh -i <key>` to check, then `IdentityFile` in `~/.ssh/config` |
| `ssh-copy-id: failed to open ID file` | private key in a password manager, absent from disk | add `-f`: `ssh-copy-id -f -i ~/.ssh/dev-vps.pub …` |
| `root@… : Permission denied (publickey)` after hardening | that is intended: root is now forbidden over SSH | connect as `dev@…`; to write in `/opt/dev-stack`, go through `~/` then `sudo install` |
| `vim: command not found` | minimal image | the script installs nano, curl and jq first of all |
| Ghostty: `keybind: unknown error error.InvalidFormat` | a key name your version does not accept | the shipped config has no active `keybind`; check with `ghostty +list-keybinds` before adding one |
| `pnpm install` fails on a project | the pnpm version does not match the repository's `packageManager` field | corepack is enabled and resolves the right version; otherwise `corepack enable` then retry |
| `git@github.com:` clone refused | the server's key is not on your GitHub account | the script switches those remotes to HTTPS when `gh` is authenticated; otherwise `gh ssh-key add ~/.ssh/id_ed25519.pub` |
| `install: cannot create directory '/home/dev': Not a directory` | an `scp` to `/home/dev/` before the user existed created a file of that name | `mv /home/dev /root/recovered.sql`, recreate the folder, rerun |
| `scp` seems to hang | connection blocked, no transfer started | `ssh -v -o ConnectTimeout=8 my-server` to see where |
| `cd: /opt/dev-stack: Permission denied` | the script folder is unreadable by `dev` | `chmod 755 /opt/dev-stack` (the script does this now) |
| `mysql-server has no installation candidate` | Debian image, or Ubuntu without `universe` | `./bootstrap.sh --only=database` (the script handles both) |
| *Access denied for user 'root'* from an app | `MYSQL_APP_PASSWORD` ≠ the app's configuration | align them, then `--only=database` |
| A URL returns 502 | dev server not started | `dev status`, then `dev up <project>` |
| `rsync: Permission denied` on `/opt/dev-stack` | folder owned by root | `./deploy.sh` fixes it; otherwise `ssh my-server 'sudo chown -R dev:dev /opt/dev-stack'` |
| A URL returns 502 while `dev status` says "online" | the ingress calls the origin with the wrong protocol | `dev doctor` names it; `dev tunnel sync` fixes it |
| Something breaks and nothing explains it | — | `ssh my-server dev-diag`: one report, to send as is |
| `Error 1033 — Cloudflare Tunnel error` | DNS points at a tunnel that no longer exists (typically after a server reinstall) | `sudo /opt/dev-stack/bootstrap.sh --only=tunnel` — it deletes the orphaned tunnel and repoints every record |
| `Blocked request. This host is not allowed` | ingress without `httpHostHeader` | `dev tunnel sync` |
| A full reload on every save | HMR not configured | the three-line patch, §8 |
| `dev up` then nothing in the logs | the command failed immediately | `dev attach <project>` for the raw error |
| `op`: *token invalid* | expired token or unshared vault | regenerate, then `--only=secrets` |
| Out of disk space | Bun/Gradle caches | `ncdu ~/projects`, `bun pm cache rm`, `./gradlew --stop` |

Logs: `/var/log/dev-stack.log` and `journalctl -u cloudflared -f`.

---

## 10. Security

The stack is closed by default: SSH keys only, root forbidden, `ufw` on deny, no
application port exposed, secrets at `chmod 600`, the database bound to
`127.0.0.1`.

**Three things to handle on your side:**

1. Scope your tokens. The Cloudflare token should be limited to one zone — never
   reuse a global token. The 1Password service account should see only the vault
   it needs, read-only.
2. Do not version secrets in your project repositories. If one already contains
   passwords or cloud keys in clear text, revoke them and move them to your secret
   manager. The server does not make that worse, but it adds one more machine
   carrying the file.
3. **Revoke everything at once** if the server is compromised: revoke the
   1Password service account, delete the tunnel in Zero Trust, remove the server's
   key from your repository host. Three clicks.

**Why no private network.** The stack was first built on a mesh VPN, then dropped
it. Its only real use was database access from the laptop — and the SSH tunnel
covers that, without depending on a third-party service or its licence. What is
lost: nothing functional. What is gained: one fewer brick to maintain, one fewer
account to watch, and a smaller exposed surface — the database is only reachable
by going through a key-authenticated SSH session.

**Throwing the server away.** Everything that matters is elsewhere: the code in
git, managed databases at their host, the secrets in your secret manager. Only
the local database and the caches live here:

```bash
ssh my-server 'dev db dump'
scp my-server:~/dumps/*.sql ./
# on the new server: scp the folder, ./bootstrap.sh, dev db import
```

Reprovisioning takes the same quarter of an hour as the first time. That is what
makes the whole thing low-risk: you build nothing you cannot walk out of.

---

## 11. Folder layout

```
server/
├── bootstrap.sh        # provisioning, 12 idempotent independent steps
├── projects.conf       # THE source of truth: projects, ports, URLs, commands
├── env.example         # template for /etc/dev-stack.env (secrets)
├── bin/
│   ├── dev             # the day-to-day command (zsh)
│   ├── dev-tui         # the dashboard (python, stdlib)
│   ├── dev-diag        # full diagnosis report, when something breaks
│   ├── dev-env         # (re)generates a project's .env.local
│   ├── dev-shots-server # the screenshot gallery (python, stdlib)
│   ├── shot.in         # template for the shot command
│   └── pupitre.zsh     # shell integration: prompt, input, folder (OSC 133 / 7)
├── agents/
│   ├── skills/         # the in-house skills: server-dev, ship, branch, pr, capture
│   ├── agents/         # the Claude Code subagents (git-shipper)
│   ├── external-skills.conf  # third-party skills to install
│   └── preferences.md  # code preferences, appended to the agents' context
├── db/                 # your .sql dumps — imported automatically, not versioned
├── mac/
│   ├── setup-mac.sh    # SSH, Ghostty, terminfo, aliases
│   ├── deploy.sh       # sends the stack and replays the steps you want
│   ├── push-secrets.sh # sends secrets.env to /etc/dev-stack.env
│   ├── secrets.env     # YOUR tokens, local, ignored by git
│   └── ghostty.conf    # Ghostty settings, included without overwriting yours
└── README.md
```
