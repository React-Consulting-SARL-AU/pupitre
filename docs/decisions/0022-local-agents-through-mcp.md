# 0022 — An AI agent on the laptop reaches Pupitre through MCP

Date: 2026-11-10 · Status: accepted · Contract: [mcp.md](../contracts/mcp.md#on-the-laptop)

**The problem.** `pupitred mcp` serves an AI agent that runs *on* the server. Claude Code, Claude Desktop or Codex running on the owner's laptop reach nothing: they cannot start a project, read its logs, and nothing at all lets an agent *set up* a machine — install a service from the catalogue, declare a project, change its processes. Those gestures live only in the app.

**The decision.** One switch in the app's settings, **AI agents on this computer**, declares two kinds of MCP servers to every client found on the laptop. Nothing is declared without that gesture, and turning it off takes out exactly what it laid.

1. **One server per machine, `pupitre-<ssh name>`**: `ssh -F <app's ssh config> -o BatchMode=yes <ssh name> /usr/local/bin/pupitred mcp`. It is the server's own MCP server, unchanged — projects, services, logs, `doctor` — over the app's own SSH configuration, its key and its pinned host key. It works with the app closed. `BatchMode` makes a key that needs a passphrase fail rather than wait on a prompt nobody sees.
2. **One server for the app, `pupitre`**: `nc -U ~/.pupitre/<folder>/mcp.sock` (or the data folder, whichever path fits a socket). The app is the MCP server; `nc` only carries its lines. It answers while the app is open and the switch is on, never otherwise: the socket is created with the switch and removed with it, owner-only (0600). macOS and Linux; Windows is not offered.

**What the app's server does.** It *sets up*; running and reading logs stay with the machine's server, and its instructions say so.

- Reads, answered at once: `servers`, `catalog`, `project_list`, `project_detect`.
- Forwards, run at once (amended on 2026-11-14): `forward_list`, `forward_open`, `forward_close`. A forward is the app's `ssh -L` to a server's loopback port: it changes only this computer and opens nothing to the internet, so it needs the owner's dialog no more than a click on a project's address does. An iOS app in the simulator, a phone app on the laptop or a local browser then calls `localhost:<port>` and reaches the server; `keep` makes it come back with the app.
- Changes, each **confirmed by the owner in the app** unless the owner turned on *Appliquer leurs modifications sans me demander*: `module_install` (install or reconfigure), `module_uninstall`, `project_add`, `project_update`, `project_remove`. The app comes to the front with a dialog naming the machine and the gesture, and saying what changes — for an update, only what differs from the project as it stands; *Allow* runs the same flow as the screen would, *Refuse* or five minutes without an answer return a refusal to the model. The confirmation is the owner's gesture by proxy: the install may then use the privileged channel and the sudo password the app already holds, as a click in the services screen would.
- **Never through MCP**: approving a device key, the sudo password, adding or removing a server, a secret in either direction (a configuration that names a secret field is refused; the app's vault fills them), dumps and imports, files, the access gate and the tunnel, backups, updating the agent.

**Declaring it.** Each client's own tool writes its own file, as on the server ([mcp.md](../contracts/mcp.md#who-declares-it)): `claude mcp add --scope user` for Claude Code, `codex mcp add` for Codex. Claude Desktop has no CLI: its `claude_desktop_config.json` is read, only `mcpServers.pupitre*` entries are written, every other key is written back as read, and a file that does not parse is refused rather than replaced. A client that is not installed is skipped. The entries follow the server list: adding, renaming or removing a machine lays, moves or takes out its entry while the switch is on. Nothing is added to a client's permission list: on the laptop, the client's own prompt stays the first guard.

**Rejected.**
- *A single app server that also runs projects*: it would duplicate `pupitred mcp` tool for tool and stop working the moment the app closes.
- *The Electron binary as the MCP command* (`Pupitre --mcp`): a second Chromium per session, and `runAsNode` is a fuse the signed build keeps off.
- *A TCP port on localhost*: any local account could reach it; a socket in the owner's folder is closed by the file system.
- *Letting writes run without a confirmation by default*, as on the server: on the server the limited session is the guard; the app holds the privileged channel, the device key and the vaults, and a model on the laptop reads untrusted pages. Running unattended is the owner's own choice, off until they make it; it never reaches secrets.

**Consequences.** Preferences gain `localAgents` and `localAgentsUnattended` (migrations 3 and 4 of `preferences-migrations.ts`). Both are off for everyone after the update. The forwards amendment adds `kept` to `forwards.json` (migration 2 of `forwards-migrations.ts`), empty for everyone after the update. Opening an address to anyone stays out of MCP: a process's access is turned over in the app, from its address, behind a confirmation.
