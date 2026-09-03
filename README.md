# Pupitre

A remote development server, and the desktop app that drives it.

You keep your projects on a Linux box that has the CPU, the RAM and the files.
You open your laptop, your dev servers are already running, your URLs answer, and
the AI agents work on the machine that can actually afford them. Pupitre is the
window onto that.

| Folder | What it is | Where to read |
|---|---|---|
| [`server/`](server/) | The stack: turns a bare Ubuntu into a development server — the `dev` command, tmux, runtimes, an optional tunnel, an optional database, a screenshot gallery, AI agents and their skills | [server/README.md](server/README.md) |
| [`app/`](app/) | The desktop app (Electron): project state, start and stop, logs, terminals, agents, autocompletion | [app/README.md](app/README.md) |

Neither half is mandatory. The server works on its own from a terminal; the app
can drive any server that answers the same commands. They live in the same
repository because they share one contract.

> **New here?** [`docs/SETUP.md`](docs/SETUP.md) walks through the whole thing
> from A to Z: which distribution to pick, how to make an SSH key, and every step
> up to a project running behind an HTTPS URL. The quick start below assumes you
> already have a server you can `ssh` into.

---

## Quick start

### 1. The app

```bash
git clone https://github.com/<you>/pupitre.git
cd pupitre/app
npm install          # or: bun install / pnpm install
npm run dev
```

Node 20+ and any of npm, pnpm or bun. That is all — the app has no server-side
prerequisite and no account to create.

To build a distributable instead of running from source:

```bash
npm run build:mac    # .dmg  (arm64 + x64)
npm run build:linux  # AppImage + .deb
npm run build:win    # NSIS installer
```

Each target has to be built on its own platform — Electron cannot cross-compile
its native modules (`node-pty`, here).

### 2. A server to point it at

The app talks to your server over SSH, reusing your system configuration. It
stores neither password nor key. So the only thing it really needs is a working
`ssh` host:

```
Host my-server
    HostName 203.0.113.10
    User dev
    IdentityFile ~/.ssh/id_ed25519
    ControlMaster auto
    ControlPath ~/.ssh/cm-%r@%h:%p
    ControlPersist 10m
```

Open Pupitre → **Settings → Servers**, pick that host, and you are connected. The
first screen tells you exactly what is missing if something is, with the command
that fixes it.

### 3. Optionally, the stack on the server

If you want the whole thing — the `dev` command, tmux windows that survive
disconnection, per-project logs, the registry, the dashboard — install the stack
on the server:

```bash
# on your own machine
cd pupitre/server/mac
./push-secrets.sh --edit --host 203.0.113.10   # your config, kept local
./push-secrets.sh --host 203.0.113.10

# on the server
sudo /opt/dev-stack/bootstrap.sh --check       # verifies, installs nothing
sudo /opt/dev-stack/bootstrap.sh

# back on your own machine
./setup-mac.sh --host 203.0.113.10
```

[`docs/SETUP.md`](docs/SETUP.md) walks through this properly, including the first
transfer of the stack folder to the server. **Nothing in the configuration is mandatory
except your SSH public key**: no tunnel, no database, no secret manager, no
particular repository host. A machine with none of them is still a machine
`bootstrap.sh` installs and `dev` drives — it simply does fewer things, and
nothing lies.

`setup-mac.sh` is macOS-specific (it knows about the 1Password SSH agent, Ghostty
and JetBrains Gateway). On Linux or Windows, write the `~/.ssh/config` block
above by hand — that is all the app needs.

---

## How the two halves fit together

The server is the single source of truth. Which projects exist, on which port,
how they start, which services run, which agents are installed: all of that lives
in `server/` — the `projects.conf` registry and the `bin/dev` command.

The app is only a client of that command. It calls `dev snapshot`, `dev projects`,
`dev completions`… over SSH and shows what it receives. The contract between them
is written down in [`app/src/shared/contract.ts`](app/src/shared/contract.ts), and
every field in it corresponds to something `server/bin/dev` returns.

The rule that follows: **a new piece of information appears on the server first,
and the app then merely shows it.** And the day the app does not start,
`ssh my-server dev status` still works.

The stack keeps its historical name on the machine — `/opt/dev-stack`,
`/etc/dev-stack.env`, the `dev` command — so that an already-installed server does
not break. The app does not care: the command name, the log path, the editor and
the install script are all fields of the server profile, in **Settings →
Advanced**.

---

## Structure

```
pupitre/
├── app/                 # the Electron app (React, xterm, node-pty)
│   ├── src/main/        # main process: ssh, terminals, git, completion
│   ├── src/preload/     # the API surface exposed to the renderer
│   ├── src/renderer/    # the interface
│   └── src/shared/      # the contract with the server, a server's profile
├── docs/                # SETUP.md — the A-to-Z walkthrough
└── server/              # the server stack
    ├── bootstrap.sh     # provisioning, idempotent steps
    ├── projects.conf    # THE source of truth: projects, ports, URLs, commands
    ├── env.example      # template for /etc/dev-stack.env (secrets)
    ├── bin/             # dev, dev-tui, dev-diag, dev-env, shot, pupitre.zsh
    ├── agents/          # what the AI agents receive: context, skills, subagents
    ├── db/              # your .sql dumps — imported automatically, not versioned
    └── mac/             # setup-mac.sh, deploy.sh, push-secrets.sh
```

## License

[MIT](LICENSE). Use it, fork it, ship it — a mention is appreciated, not required.
