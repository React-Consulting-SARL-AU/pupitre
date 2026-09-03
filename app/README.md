# Pupitre — the app

A desktop app that drives a remote development server over SSH: project state,
start and stop, live logs, terminals, AI agents.

```bash
npm install     # or bun install / pnpm install
npm run dev
```

## Requirements

Node 20 or later, and one of npm, pnpm or bun. Nothing else — no account, no
service to sign up for, no server-side prerequisite beyond an `ssh` host you can
already reach.

`node-pty` is a native module: `postinstall` runs `electron-rebuild` on it. If
that step is skipped, the app starts and no terminal ever opens.

With bun, `trustedDependencies` declares `electron` — without it Bun does not run
its install script and the binary is never downloaded.

## Building

```bash
npm run build          # type-check + bundle, no packaging
npm run build:mac      # .dmg for arm64 and x64
npm run build:linux    # AppImage + .deb
npm run build:win      # NSIS installer
```

Each platform has to be built on itself: electron-builder can package for
several architectures of the same OS, but the native module has to be compiled by
the target platform.

## The principle

The app is a **client of the server's admin command** — `dev` here, another name
elsewhere, the server profile says which — and never a second brain.

All the logic — which projects exist, on which port, how to start them, where
their logs are — lives in the server's registry and script. The app calls those
commands over SSH and shows their result.

That is what avoids two sources of truth drifting apart: adding a project stays
one line in `projects.conf`, and the interface shows it without being
recompiled. And the day the app does not start, `ssh my-server dev status` still
works.

The contract is `dev snapshot`, which returns the machine, its services and its
projects in a single call. See [`src/shared/contract.ts`](src/shared/contract.ts).

## What the app does not assume

It has to be able to drive someone else's machine, which has neither the same
repository host, nor the same tunnel, nor the same database — or none of the
three. So none of that is written into the code:

| What varies | Where it comes from |
|---|---|
| The services that run | `services` in the snapshot, shown as is; a server that announces none shows none |
| Secrets | The server says which keys exist, and says itself what has to be restarted afterwards; with no secret management, the page disappears |
| The project registry, sessions, processes, logs | Observed on connection: what does not exist gets no tab |
| The agents (`claude`, `codex`) | Looked for on the server; absent, their tabs do not appear |
| The command name, the log path, the remote editor, the install script | The server profile, in Settings → **Advanced** |
| Package managers | `package_managers` in the snapshot, otherwise a starting list, and the field stays free |
| How a project installs its dependencies | The registry's install column, or what the server derives from the package manager — the app shows the command either way rather than the tool's name |

The profile defaults describe the `dev` stack: an existing configuration is
completed with them on first read — the same behaviour as before, but now
changeable without a rebuild.

## Navigation

The app remembers where you were. Each project reopens on the tab you left it on
— coming back to a project you were driving from its Claude tab and landing on
the overview means finding the session again by hand, every time — and a relaunch
lands on the view and the project you had open.

That lives in `localStorage`, through `src/renderer/src/lib/memory.ts`, and holds
navigation only: no data, no secret. If it is lost the app opens on the
dashboard, and nothing else is.

A remembered tab the project no longer offers — an agent uninstalled, a folder
that is no longer a repository — falls back to the overview rather than showing a
panel with no button to leave it by.

## The connection

No secret is configured here. The app reads the system's `~/.ssh/config` — the
block of the host chosen in the settings — and merely checks it:

| Check | Command |
|---|---|
| The host is declared | `ssh -G my-server` |
| The agent answers | `ssh-add -l` |
| The server accepts the key | `ssh -o BatchMode=yes my-server true` |
| The connection is reused | `ssh -O check my-server` |

Each check carries its own remedy. If no configuration is found, the wizard runs
the install script — the one the server profile names, if it names one — rather
than writing into `~/.ssh/config` itself: two configurations drifting apart would
be the next breakdown. With no script, it shows the block to paste.

## A single ssh process

Starting `ssh` costs nearly 200 ms on macOS — the local client, not the network,
and multiplexing does not change that. So the app opens **one remote shell once**
and writes its commands into it, each bounded by an end marker. Calls are
serialised: two concurrent reads on the same buffer would steal each other's
answers.

## Terminal autocompletion

In a Terminal tab, what you type completes: the server command's grammar and its
projects, the remote shell's history, the paths of the current folder. `⇥`
completes, `↑` `↓` choose, `→` accepts the grey suggestion coming from history,
`⎋` closes.

None of it is guessed from the screen. The server's shell announces where input
starts (OSC 133, emitted by `server/bin/pupitre.zsh`), and the app reads the line
between that marker and the cursor — keystrokes, deletions and history recalls
included. The grammar comes from `dev completions`: a list copied here would go
stale at the first subcommand added over there. A server that does not return it
simply lacks that source, and history and paths remain.

The Claude, Codex and Dashboard tabs have none: those programs handle their own
input.

## Security

The renderer has no access to the system: `contextIsolation` on,
`nodeIntegration` off, and an explicit API surface in the preload.

No free-form string coming from the interface reaches a shell. The renderer names
a project and an action; the main process validates the name against the list the
server has just given it before turning it into a command.

## Stack

Electron 42, `electron-vite`, React 19, Vite, Tailwind 4, TypeScript, Zustand,
Biome.
