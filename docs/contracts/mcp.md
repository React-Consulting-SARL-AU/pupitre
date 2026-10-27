# The MCP server on the VPS

An AI agent that works on the customer's server — Claude Code, Codex — drives the projects and services through Pupitre instead of the shell. `pupitred mcp` is that door: a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, launched by the AI agent itself, as `dev`.

It is a subcommand of the signed binary, not a script, and it opens no port: the AI agent writes JSON-RPC on its standard input and reads the answers on its standard output, one message per line. Nothing on the server listens for it.

## What it reaches, and what it does not

`pupitred mcp` asks the agent exactly as `dev` does from a terminal (`pupitred dev`): through `sudo -n pupitred serve`, the **limited session** of [decision 0015](../decisions/0015-sudo-by-password.md). Every tool maps to a command of `LimitedCommands`; a test fails if one ever reaches a command that `requiresPrivilege` designates. The privileged session would ask the sudo password on a terminal this process does not have, and an AI agent running unattended as `dev` is precisely what that password keeps out. Installing, configuring, revealing a secret, opening a project to the web, dumping or importing a database stay the owner's gestures, in the app.

A machine the agent cannot be reached on — no sudo, a licence refused — still starts the server: each tool then answers with the agent's refusal and its `fix`, where the model reads it.

## The tools

The names, the arguments and the descriptions are the contract the model reads; they are in English, like the protocol. Arguments are closed: an unknown key is refused.

| Tool | Arguments | Commands | Result |
| --- | --- | --- | --- |
| `status` | — | `status` | the agent's answer, as JSON text |
| `project_list` | — | `project.list` | the agent's answer, as JSON text |
| `project_start` | `project`, `process?`, `wait_seconds?` | `project.up`, then `project.list` once a second | `{ project, state, processes[{ id, state, port?, url? }], logs? }` |
| `project_restart` | `project`, `process?`, `wait_seconds?` | `project.restart`, then the same | the same |
| `project_stop` | `project`, `process?` | `project.down` | the agent's answer |
| `project_logs` | `project`, `process?`, `lines?` | `project.list`, `project.logs` per process | each process's lines under a `── project/process · state` header |
| `service_start`, `service_stop`, `service_restart` | `service` | `service.start`, `service.stop`, `service.restart` | the agent's answer |
| `service_logs` | `service`, `lines?` | `service.logs` | the journal's lines |
| `doctor` | — | `doctor` | the agent's answer |

- **Waiting.** A start or a restart waits until no targeted process is `starting` any more, at most `wait_seconds` — 45 by default, under the 60 seconds Codex gives a tool call, 300 at most, 0 to return at once. A process that ends `failed` comes back with the last 40 lines of its log. `project: "all"` starts every project and returns at once.
- **Logs.** 200 lines per process by default, 2000 at most.
- **Pages.** `pupitred mcp` shows none: since 2.2.1 the `screenshot` tool is gone ([decision 0021](../decisions/0021-browser-mcp.md)), and the instructions send the model to the `playwright` server below.
- **Errors.** A refusal of the agent is the tool's result, with `isError` and the text `message` then `fix`. Only a call that is not JSON-RPC, names no known method or names no known tool is a protocol error.

## The session

- Protocol versions: `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`. A client asking for one of them gets it back; any other gets the newest.
- Methods: `initialize`, `ping`, `tools/list`, `tools/call`. Notifications are read and never answered. The server declares `tools` without `listChanged`: the list is fixed for the life of the binary.
- A message never exceeds four mebibytes, the agent protocol's own ceiling.
- The language is the shell's (`LANG`), as for `pupitred dev`: the agent's refusals come back in French or English; the tools' descriptions stay in English.

## Who declares it

The AI agent modules do, with the client's own CLI, so the client's file stays the client's and its format moves with its releases:

| Module | Command, run as `dev` | File the CLI writes |
| --- | --- | --- |
| `ai.claude` | `claude mcp add --scope user pupitre -- /usr/local/bin/pupitred mcp` | `~/.claude.json`, `mcpServers.pupitre` |
| `ai.codex` | `codex mcp add pupitre -- /usr/local/bin/pupitred mcp` | `~/.codex/config.toml`, `[mcp_servers.pupitre]` |

For Claude Code, the step `allow-mcp-tools` then adds the rule `mcp__pupitre` to `permissions.allow` of `~/.claude/settings.json`, so the tools run without a prompt: they only reach the limited session, which already refuses what needs the owner. Every other key of that file is written back as read, a file that does not parse is refused rather than replaced, and the uninstall takes only that rule out (`disallow-mcp-tools`). Codex keeps no such list.

The step `register-mcp` reads the file first and does nothing when `pupitre` already runs `/usr/local/bin/pupitred mcp`; an entry under that name that runs anything else is removed, then added again. The module reads as configured only once the server is declared. Its uninstall removes the entry before the CLI; the rest of the file is the client's.

## The browser: Playwright MCP

([Decision 0021](../decisions/0021-browser-mcp.md).) When a browser is on the machine — the one `ai.browser` installs —, the same clients are given a second server, **`playwright`**: Microsoft's Playwright MCP, which the AI agent drives itself to open a page, sign in, click, fill, read the console and take a screenshot.

- **Install** (`install-browser-mcp`): mise's npm backend, `npm:@playwright/mcp` at `agents.PlaywrightVersion` (0.0.83), behind the `~/.local/share/mise/shims/playwright-mcp` shim. Nothing else is downloaded: the browser is the machine's.
- **Declare** (`register-browser-mcp`), with the client's CLI as above: `<shim> --headless --isolated --no-sandbox --executable-path <browser> --output-dir ~/.cache/playwright-mcp`. `<browser>` is the first of Google Chrome, Chrome for Testing's headless shell (arm64) and Chromium found on the machine. The profile stays in memory; a screenshot without a name lands in the output folder, never in the project's repository.
- **Allow** (`allow-browser-tools`): Claude Code's `permissions.allow` gains `mcp__playwright`, so the browser runs without a prompt; `disallow-browser-tools` takes it out.
- **Follow the browser.** `ai.browser`'s Configure lays the server into every installed client; its Uninstall removes the browser, takes `playwright` out of every client (`unregister-browser-mcp`) and removes the tool (`remove-browser-mcp`). A client configured while a browser is present lays it too, and its uninstall takes it out with `pupitre`. A client reads as configured only when its `playwright` entry matches the machine — present with the pinned version and the browser found, absent without a browser —, and `ai.browser` only when every installed client agrees: the daemon's refresh below settles a server left halfway.

## Carrying an installed server forward

The server reaches a machine already installed without a reinstallation:

1. The app updates the agent, then migrates its configuration ([the order of an update](./config-migrations.md#the-order-of-an-update)).
2. When the configuration is current, it runs `upgrade` on the installed `ai.*` modules by itself. Their `Upgrade` replays `Configure`: the machine context and the skills are rewritten to today's text, the retired skills are removed (`retire-skills`), and the MCP server is declared (`register-mcp`).
3. On `ai.browser`, the same `upgrade` retires what the screenshot gallery left before 2.1.0 — its `pupitre-shots` service, `/etc/pupitre/shots.env` and the exposure's route with it, the `shot` link — and keeps `~/shots`, which holds the customer's captures. Migration 9 of the agent's registry drops the `subdomain` field from `install.json`.

**The daemon catches up whatever the route.** An agent replaced by an app older than this step, by `binary install`, or an app whose snapshot was not ready, leaves the modules behind, and the snapshot still reads them `configured`: that flag only says no question waits. So `pupitred daemon`, at each start and once its configuration is current, runs `Configure` — never the CLI's upgrade — on the installed modules that only lay what the binary ships (`modules.Refreshed`: `ai.claude`, `ai.codex`, `ai.copilot`, `ai.cursor`, `ai.gemini`, `ai.opencode`, `ai.browser`) and whose `Check` finds them behind, deferred ones excepted. A current machine runs nothing and keeps its last report; a refusal (lock held, licence, migration owed) goes to the journal, and the next start tries again. `ai.hermes` and `ai.openclaw` are left out: their `Configure` writes the providers and drives a service, which only a gesture of the owner replays.
