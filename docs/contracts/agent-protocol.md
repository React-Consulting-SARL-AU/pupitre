# App ↔ agent protocol

The channel is an SSH session opened by the app with the customer's key, which runs `pupitred serve` — or `pupitred serve --privileged`, see [two sessions](#two-sessions-passwordless-and-privileged). The app writes one JSON request per line on standard input; the agent answers with one JSON line, or with a stream of events followed by a response. The types live in `packages/shared/src/agent-protocol/` and are exported as JSON Schema for Go.

## Envelope

```jsonc
// request
{ "id": 12, "cmd": "project.up", "params": { "name": "flyleaf-api" } }

// event, zero or more, for a long command
{ "id": 12, "event": "log", "line": "vite v7 ready in 412 ms" }

// response, exactly one
{ "id": 12, "ok": true, "result": { "state": "online", "port": 5173 } }
{ "id": 12, "ok": false, "error": { "code": "project_not_found", "message": "…", "fix": "…" } }
```

- `id` is chosen by the app, increasing, and never reused within a session.
- A line, request or event, never exceeds four mebibytes — the largest legal line in the protocol, an `fs.write`, fits in less than half of that. Each side cuts off beyond it: the app closes the channel, the agent answers `bad_request` then closes the session.
- Requests are serialised on the app side: a single command in flight per channel. Long commands (`project.pull`, `project.sync`) open a second channel so they do not block state reads, the reads the app makes on a timer (`snapshot`, `processes.list`) get a third, so that a user action never waits behind them, and followed logs (`project.logs`, `service.logs`) get a fourth: a follow holds its channel for as long as the reader stays, and nothing bounded should have to wait behind it. These four channels are the passwordless session; whatever the contract keeps for `--privileged` — `install` and `upgrade` included — goes over a fifth, opened on demand and closed again after one minute without use.
- Every error carries a stable `code`, a `message` for the human, a `fix` when a remedy exists, and a `remedy` when that remedy fits in a value.
- The first command of a session is `hello`; the agent refuses everything else until it has happened.
- **A disconnection takes the session down, not the command.** `pupitred serve` ignores the closing of its descriptors: `install`, `upgrade` and `harden` run to the end with nobody to read them, the report is written before each step, and a lock on `/var/lib/pupitre/install.lock` makes any other session — or `pupitred install` on the machine — answer `busy` for as long as that run lasts. The app, for its part, reopens the channel for as long as the command had time to run, replays the steps the channel did not carry according to the report, and reads it again until `finished_at`. A report dated before the request belongs to another run: the disconnection is then the only truth to report, and `busy` in answer to an `install` is followed as an installation in progress.
- **Project commands, by contrast, die with their channel.** `project.install`, `project.sync` and `project.pull` share the lock at `/var/lib/pupitre/project-install.lock`: a second run — from another session, each channel being its own process — answers `busy` rather than work the same folders. And their work stops with the channel that asked for it: a disconnection in the middle of a `bun install` interrupts it, instead of leaving it running invisible and unstoppable; a package manager picks up where its own had stopped.

### The structured remedy

`fix` is a sentence, written for a human. When the remedy fits in a value, the error also carries `remedy`, an object discriminated by its own `code`:

```jsonc
{ "id": 12, "ok": false, "error": {
  "code": "bad_request",
  "message": "port 3000 is already taken by web",
  "fix": "Give api another port, for example 3001.",
  "remedy": { "code": "port_taken", "port_free": 3001 }
} }
```

Two remedies exist. `invalid_fields` accompanies `invalid_config` and carries the `FieldProblem`s of the refused configuration, one per field, so that the screen marks the fields instead of printing a sentence. `port_taken` is returned by `project.add` when a declared project already holds the requested port. `port_free` is the first free port in the registry starting from that one. The app applies this value instead of extracting an integer from a French sentence — a wording changes, a field does not.

`remedy` is optional and never replaces `fix`: an error whose remedy does not boil down to a value carries none.

## Commands

Everything below is in the contract and answers on `pupitred serve --privileged`; `pupitred serve` answers only part of it, see [two sessions](#two-sessions-passwordless-and-privileged). Nine commands are called by no screen of the app today: `status`, `doctor`, `diag`, `project.debug`, `sessions.list`, `secrets.sync`, `keys.list`, `keys.sync` and `tunnel.restart`. `status` and `doctor` can also be obtained on the machine with `pupitred dev status` and `pupitred dev doctor`; the others exist only in the protocol.

Every response is held to `<Command>Result` in `schema.json` (`contract.ResultDefinition`): `cmd/pupitred/contract_test.go` calls every command the production server serves and fails on a command without a case, except the exclusions it names with the reason and the place where their result is verified; the `modtest` transcripts validate every `ok` response and every event against its definition and fail on a command or an event that has none.

### Session

| Command | Parameters | Result |
| --- | --- | --- |
| `hello` | `{ app_version, protocol, locale? }` | `{ agent_version, protocol, server_id?, license: "valid" \| "grace" \| "restricted" \| "dev", capabilities[], config? }`. `PROTOCOL_VERSION` is **3** since 2.0.0: the licence used to be called `entitlement` in protocol 2, and the rename is what opens the generation. An incompatible `protocol` returns `protocol_mismatch` with the expected version. `locale` is `fr` or `en` — the languages the product serves — and applies to the whole session: the agent answers in that language when it knows it, in its own otherwise. Never an error, never an empty field. An agent of an earlier version ignores the field and answers as before; the protocol version therefore does not move. `server_id` is the server's identifier on the platform, once the daemon has read it from `/agent/state` and kept it in `/etc/pupitre/server.id`; absent before that. `config` says where the machine's configuration stands relative to the binary reading it — `{ revision, expected, state }` — and see [configuration migrations](./config-migrations.md); an agent that predates the registry does not return it, and the app then treats the configuration as current |
| `ping` | — | `{ ts }` |

### Inspection and installation

| Command | Parameters | Result |
| --- | --- | --- |
| `probe` | — | the probe report: `os`, `version`, `arch`, `ram_mb`, `disk_free_gb`, `sudo`, `ports[]`, `docker`, `panel`, `agent_version`, `installed_modules[]`, `verdict` |

`arch` is a free string, the raw architecture reported by the machine (`uname -m` normalised): `amd64` and `arm64` are the known and supported values, but the field must also be able to carry an unsupported architecture such as `i686`, the very one the `incompatible` verdict exists to flag.

`disk_free_gb` is a single number: the smaller of the free space at the root and that of the projects folder. The projects folder often lives on its own volume, and it is whichever of the two will run short first; reporting two numbers would not help decide whether the machine is suitable.

`verdict` describes what installing on this machine would imply:

| Field | Type | Description |
| --- | --- | --- |
| `level` | `"ready" \| "warning" \| "blocked"` | the severity |
| `kind` | `"bare" \| "managed" \| "occupied" \| "incompatible"` | the kind of machine |
| `up_to_date` | `boolean`, optional | present only when `kind` is `managed`: whether the installed agent is at the current version |
| `reasons[]` | `string[]` | what was observed |
| `fixes[]` | `string[]` | how to remedy it, one fix per reason when `kind` is `incompatible` or `occupied`; empty on a `bare` machine or an up-to-date `managed` agent |
| `catalog` | — | `{ modules: Manifest[], presets: Preset[] }` per [service-catalog.md](./service-catalog.md); a `Preset` carries its `id`, its displayable `name` and its `modules`, so the app has nothing to translate |
| `install` | `{ modules[], config: Record<moduleId, values>, defer?: moduleId[], secrets_stdin: true }` | `step` events `{ module, step, status: "start" \| "ok" \| "skip" \| "fail", ms, replay?, message? }` — `replay` is the command that replays the module, `message` is what the agent has to say about the step — the raw (redacted) line of a `fail`, or the warning carried by an `ok`/`skip` step — then `{ failed[], warned[], report_path }`, where `failed` and `warned` are module identifiers, once each. Secrets are read on a separate stream, never in `params`. `config` replaces the module's configuration; a secret absent from the stream is not erased, the agent keeps the one it holds, so changing a port does not empty a password. **The whole configuration is validated before the first step**: a refusal is `invalid_config`, carries the complete list in its `invalid_fields` remedy, and nothing is touched on the machine |
| `install.check` | `{ modules[], config, defer?: moduleId[] }` | `{ problems: FieldProblem[], warnings[] }` per [service-catalog.md](./service-catalog.md). No secret accompanies it and nothing is touched: it replays the field validation and adds what only the machine knows — a port already listened on, a folder that is a file, a timezone this kernel does not know. It never judges a secret, which the app alone holds before the installation |
| `uninstall` | `{ modules[] }` | `step` events, then `{ failed[] }` |
| `harden` | `{ user: "dev" }` | `step` events, then `{ root_closed: boolean, root_kept: boolean, next_user, reason? }`. Closes root only if a key opens `dev`. `root_kept` says root stays open because `keep_root` asks for it, never because the hardening gave up: the two flags are never true together, and a refusal is `root_closed: false` with its `reason` |
| `harden.sudo` | `{ user: "dev", secrets_stdin: true }`, then the line `{ password_hash }` | `step` events, then `{ sudo: "password" }`. Gives `dev` the password whose hash the app computed, then leaves it passwordless access only to `pupitred` ([decision 0015](../decisions/0015-sudo-by-password.md)); see [the sudo password](#the-sudo-password) |
| `upgrade` | `{ modules?: string[] }` | same as `install`, on the modules already present |
| `module.config` | `{ id }` | what the agent retained from the last request for this module: `{ id, values, secrets[] }`. `values` carries the configuration in the clear, `secrets[]` only the names of the secret fields held — no secret value leaves this way. This is what the app puts back into the form of an already installed module |
| `report` | — | the report of the installation in progress or the last one; `no_report` as long as none has taken place on this server. The agent writes it before each `step` event: while the installation runs, `finished_at` is empty and a `start` step with no end is the one that is running. This is what an app whose channel dropped reads again, until `finished_at` is set |

`defer` names the modules to put in place **without configuring them**: their fields are not weighed — there is no answer to judge — their `Configure` step does not run, and the agent notes them in `install.json`. A service whose settings the customer does not yet have, or whose account is not connected, therefore no longer holds back the whole installation; it waits on the services screen, where the form finishes it. A `mandatory` module cannot be put off: the request is refused with `bad_request` before the first step.

A module stays deferred **until the request that names it without deferring it** — the app's, or a replay on the machine — and that request is judged like the others: without an answer to its required fields, it is refused with `invalid_config` and nothing moves. `upgrade` leaves these modules alone, having no settings to replay, and `uninstall` forgets them.

`snapshot`, `status` and `service.status` return each service with `configured`: **false for a module that was deferred and never taken up since**, true for any other installed module. A module does not decide this — it can only say what is on disk, and a drift after an upgrade would read as questions without an answer — the agent does, from what the requests have left. An agent that predates the field does not return it, and the app then treats the service as configured.

They also return two answers from the manifest, so that the app's dashboard does not have to read the catalogue: `runs` — the module holds a process, or launches one at any moment; the app shows only those, and an agent that predates the field does not return it, in which case the app treats the service as one that runs — and `connection`, the third-party account the app must hold for this module, absent when the manifest declares none. That is what the app uses to say whether a tunnel is connected: the account it holds, never a question put to the agent.

### State

| Command | Result |
| --- | --- |
| `snapshot` | `{ machine, services[], projects[], sessions[], license }` in one call, each project with its `processes[]`. This is what the dashboard reads every 3 seconds. `machine.sudo` says what sudo asks of `dev`: `password` under the `harden.sudo` rule, `nopasswd_all` under the earlier one; absent for any other rule, and from an agent that predates the field |
| `status` | `{ services[], projects[] }`, lighter |
| `service.status` `{ id }` | state, version, port, credentials (masked), systemd unit, `versions[]` for a runtime held in several majors, `path` when the reader's workstation must point at a folder the module has put in place (the backend that JetBrains Gateway opens), and `login` for a module whose CLI connects to an account |
| `completions` `{ path? }` | what is needed to complete a terminal line: `{ command, sub[], projects[], root, path, paths[] }` |

`completions` answers the three questions of an autocompletion at once, so the app has nothing to guess:

| Field | Type | Description |
| --- | --- | --- |
| `command` | `string` | the name under which the control commands are called on this server: `dev`, that is `pupitred dev` |
| `sub[]` | `{ name, help, args }` | the grammar: a verb, its help, and a list of values per argument position. `$project` is a wildcard the app replaces with `projects[]`; `$process` is one the app replaces with the processes of the project typed just before — `dev up intranet server`, `dev logs intranet client` — and which a single-process project drops, the verb then taking its first |
| `projects[]` | `string[]` | the actual projects of the registry, in its order |
| `root` | `string` | the projects root, the only folder `completions` reads |
| `path` | `string` | the folder actually listed, relative to `root`; empty for the root |
| `paths[]` | `string[]` | the entries of that folder, relative to it, folders with a trailing slash |

`path` is relative to `root`: an absolute path or a `..` that leaves the root returns `bad_request`. A missing folder returns `paths: []` and not an error — a completion does not make a keystroke fail.

A `Project` is a repository, or a folder, and carries what runs in it: `processes[]`, at least one. The project holds the name, the folder, the repository and the branch — everything that is git; each `Process` holds an `id`, its own folder `dir` relative to the project (`.` for the root), its package manager, its start command, its install line, its host, its main port and its `routes[]`. The case of a repository that holds a Grails server and its React client is the general case: a project `intranet`, a process `server` at the root under gradle, a process `client` in `client/` under pnpm, each on its own port and in its own tmux window. A single-process project — the most frequent case — has the same shape, with a one-element list.

A `Project` carries two paths. `dir` is the folder declared in the registry, relative to the server's projects root, and it is what `project.add` takes as a parameter. `path` is that same folder in absolute form, resolved by the agent: `/home/dev/projects/intranet`. It is `path` that is opened in the remote editor, where a terminal is started and where `agent.open` launches an agent: at the root of the repository, whatever the subfolder of its processes. Each `Process` likewise carries its own absolute `path`, under the project's.

The absolute path lives on the project, not on the machine: `status`, `project.list` and `project.add` return projects without returning a `machine`, and the app would have no root to stitch back on. It therefore never concatenates anything — the projects root is not in the contract, it is a detail of the server.

`path` is always present and always inside the projects root, versioned or not: the agent resolves it then checks containment, and a registry line that pointed elsewhere — or one of whose processes escaped the project's folder — is not a project: it does not come out of `project.list`. When the project is a git repository, `path` is consistent with the `root` returned by `project.git_status`: the latter is the root git declares, which is `path` or one of its parents inside the projects root, never above it.

### Projects

| Command | Parameters |
| --- | --- |
| `project.list` | — |
| `project.add` | `{ name, dir, repo?, branch?, boot?, runtimes?, protected?, processes[] }`: an absent `protected` is `true`; each process carries `{ id, dir?, pkgmgr, host, port, routes[], cmd, install?, protected? }`, an absent `protected` following the project; each route `{ label, port, subdomain? }`; an absent `dir` is `.`. A project with `repo` creates no folder — the clone brings them — and refuses with `bad_request`, before writing its line, a folder already there that is neither empty nor a clone of that same repository; a project without `repo` gets the folder of each of its processes |
| `project.detect` | `{ repo, branch? }` or `{ dir }`: what a repository asks for, without installing anything |
| `project.update` | `{ name, patch }` with `patch: { branch?, boot?, runtimes?, protected?, processes? }`: rewrites the project's line and answers the updated `Project`. Like `project.add`, the response carries `warnings[]` when a step refused once the line was written — a folder that cannot be created, a runtime pin, a start: the line holds, the app shows the sentences as warnings, and a second `add` would answer that the project is already declared |
| `project.remove` | `{ name }` (the folder stays) |
| `project.up` / `project.down` / `project.restart` | `{ name \| "all", process? }`: all the project's processes, or the one `process` names; `all` names none |
| `project.logs` | `{ name, process, lines?, follow? }` → `log` events if `follow`: the log of one process, never of the whole project. The log is captured from the tmux window, escape sequences included: it is up to the app to interpret them. Each start writes `=== pupitre up <RFC 3339> ===` on its own line, each stop `=== pupitre down <RFC 3339> ===`; a start empties the log before writing. A follow survives the process stopping and restarting — it reads the log again from its first byte when the latter shrinks — and ends only with the channel or its own quarter of an hour. A line travels only whole: what is read before its line break waits for the rest — unless it exceeds 64 KiB without a line break, in which case it goes out as it is rather than grow without bound; a burst wider than a mebibyte delivers only its end |
| `project.pull` | `{ name }` → `{ pulled, state }`: clones if the folder has no repository, `pull --rebase --autostash` otherwise, and nothing else; `pulled` is false for a folder without a repository. A kept folder of a removed project is taken up as is: if it already holds a repository whose `origin` is not the one the line declares — to the form of writing, scheme, account, `.git` — the command refuses with `bad_request` naming both, and pulls nothing; if it is full without a repository, the clone refuses with git's own words. This is the "sources" phase of adding a project, the installation coming next via `project.install`. Shares the installation lock: `busy` if a run already holds the machine |
| `project.sync` | `{ name }` → `log` events during the installation, then `{ pulled, installed, state }`: `project.pull` then `project.install` in one command, the synchronisation gesture of a project's screen — a single `pull`, one installation per process. Stops with its channel, under the installation lock: `busy` answers any concurrent run |
| `project.install` | `{ name, process? }` → `log { line }` events while the install command runs, then `{ done, installed[] }`: `installed` lists `{ process, command }` for each process whose install line ran, `bun install` for example; a process that declares none does not appear. The command stops with its channel — a disconnection interrupts the installation — and answers `busy` to any concurrent run, under `/var/lib/pupitre/project-install.lock` |
| `project.env` | `{ name, process?, force? }` → `{ path, written, keys[], template }`: writes `.env.local` at the project root, or in the named process's folder, from `.env.1password.tpl` or `.env.example`; `keys` carries only names, never a value; `template` says whether the repository versions either template. A file already there is read, not rewritten, unless `force`. A repository without a template is not an error: `template: false`, `keys: []` if nothing has ever been written — a project may have no environment |
| `project.branches` | `{ name }` |
| `project.checkout` | `{ name, branch }` |
| `project.git_status` | `{ name }`: `behind`, `ahead`, `dirty`, `changed`, `last`, `subject`, `problem` |
| `project.working_tree` | `{ name }`: changed files |
| `project.diff` | `{ name, path }`: the raw patch |
| `project.url` | `{ name }` |
| `project.debug` | `{ name, process }`: restart of a process with the JVM debug agent → `{ state, port, debug_port }` |

#### One process, one window, one state

Each process runs in its own tmux window, named `<project>/<process>` — neither a project name nor a process identifier admits a slash, so a window reads back without ambiguity — and writes its log under `~/.pupitre/logs/<project>/<process>.log`. A process identifier is a DNS label, like a route's label.

A `Process` carries its own `state`, read from its window and its main port: `online`, `starting`, `failed`, `stopped`, `down`, `external`, `service`. The window runs the command itself, in the user's login shell, and tmux keeps the pane once the command has exited: a process whose command has ended is never `starting` — it is `stopped` if it returned 0, `failed` otherwise or if a signal killed it. `starting` therefore says only one thing: the command is running and the declared port does not respond yet. `project.up` answers as soon as the window is open, with that state; what follows is read on `project.list` or `snapshot`. `project.up` and `project.restart` replace a dead pane, `project.down` closes it.

What is running survives a reboot of the machine. Each start records its window in `/var/lib/pupitre/projects.running.json`, each stop — `project.down`, a process removed by `project.update`, `project.remove` — removes it: the file says what the reader wants to see running, not what the machine is executing. A project can also ask to **start with the server**: `boot` on its line, set by `project.add` and changed by `project.update`, false until someone asks (migration no. 3 for earlier lines). At boot, the `pupitre-resume.service` unit (a `oneshot` put in place by `core.system`, apart from the daemon whose private `/tmp` would hide the tmux socket) launches `pupitred resume`, which relaunches each recorded window still declared, then each process of the projects marked `boot`, and leaves the others; an existing tmux session — a daemon restarted for an update — makes it keep quiet. A process that died by itself before the shutdown is relaunched like the others: the wish to see it running has not changed. The project's `state` is deduced from them, from worst to best: `failed` if a process failed, `starting` if one is starting, `online` if all are running, **`partial`** if only some are, `stopped` otherwise. `partial` is the only state a process never has by itself. A `service` process is systemd's business, as before: neither the project nor `all` starts or stops it, and a project that holds only such processes is `service`.

A process's `url` is that of the route of its main port when it carries a name on the web, its local address otherwise; the project's `url` is that of the first published process, and failing that the local address of the first. This address is the one the machine sees: from the reader's computer the app opens only an `https://` address, and shows the other for what it is. `pid`, `ram_mb` and `uptime_s` live on each process.

#### The debug port comes from the machine

`project.debug` stops the process then relaunches it by adding `-PdebugPort=<port>` to its own command, and answers the state, the process's port and the debug port. This port listens only on the loopback: it comes back through the SSH session like the database, nothing new opens on the firewall. `project.restart` puts the process back on a normal start; there is no second parameter for that.

Which processes are debuggable and on which port is read in `/etc/pupitre/env`, never in the binary, one entry per window:

```
PUPITRE_DEBUG_PORTS="intranet/server:5005 flyleaf/worker:5006"
```

The quotes are systemd's, which reads this file as an `EnvironmentFile`: without them, a value with spaces would no longer be a single variable. A process absent from the list is refused with `bad_request`, with the line to write in the `fix`; a `service` process, which belongs to systemd and not to a tmux window, is refused too.

#### A project's environment comes from the registry

What Pupitre knows about a project — its port, its addresses, those of its neighbours — arrives in its environment, prefixed `PUPITRE_`, so that a script reads it instead of freezing it. These names are a contract with the customers' code: names are added, none is renamed or removed.

| Variable | Value | Where |
| --- | --- | --- |
| `PUPITRE` | `1` | everywhere |
| `PUPITRE_PROJECTS_DIR` | the projects root, `/home/dev/projects` | everywhere |
| `PUPITRE_DOMAIN` | the domain the server publishes, absent without exposure | everywhere |
| `PUPITRE_PROJECT` | the project's name | project |
| `PUPITRE_PROJECT_DIR` | the project's folder, absolute | project |
| `PUPITRE_PROJECT_URL` | the project's `url` | project |
| `PUPITRE_PROCESS_<ID>_PORT` | the main port of each of the project's processes | project |
| `PUPITRE_PROCESS_<ID>_URL` | the `url` of each of the project's processes | project |
| `PUPITRE_PROCESS` | the process's identifier | process |
| `PUPITRE_PROCESS_DIR` | the process's folder, absolute | process |
| `PUPITRE_HOST` / `PUPITRE_PORT` | the host and main port to bind the server to | process |
| `PUPITRE_URL` | the process's `url`: public if it exists, local otherwise | process |
| `PUPITRE_LOCAL_URL` | `http://<host>:<port>` | process |
| `PUPITRE_PUBLIC_URL` | `https://<hostname>` of the main route, absent if it is not published | process |
| `PUPITRE_ROUTE_<LABEL>_PORT` / `_URL` | the port of each of the process's routes, and its address: public if it carries a name, local otherwise | process |

`<ID>` and `<LABEL>` are the identifier or the label in capitals, hyphen changed to underscore: `api-v2` gives `PUPITRE_PROCESS_API_V2_URL`. Both are DNS labels, so two processes never share a name, and the `PROCESS_` and `ROUTE_` prefixes keep a process named `public` apart from `PUPITRE_PUBLIC_URL`. No secret goes through here: the 1Password token and the keys stay where they are.

**A process receives everything, at start.** `project.up`, `project.restart`, `project.debug`, the resume at boot and a restart by `project.update` open the window with `tmux new-window -e` for each variable of the three levels, computed from the registry at that moment. `PORT` and `HOST` are never set: an injected variable would take precedence over the repository's `.env.local`, and Pupitre would silently change a project that worked. The client writes `--port $PUPITRE_PORT` if it wants to.

**A launched process keeps what it received.** The window retains the fingerprint of its environment in the `@pupitre_env` option. When the registry would give something else — a moved domain, a published route, a changed port, an added neighbour —, the `Process` of a running process carries **`env_changed: true`**, and the app offers to restart it. Nothing restarts by itself. A window without a fingerprint, opened before the agent set one, is never `env_changed`.

**A terminal follows its folder.** The agent writes what each folder receives into `~/.pupitre/environment.json`, owned by `dev`: at each write of the registry and at each `snapshot` that finds it out of date. The `core.system` block of `.zshrc` and `.bashrc` exports `PUPITRE=1` and `PUPITRE_PROJECTS_DIR`, then evaluates `pupitred env` before each prompt — and, under zsh, at each change of folder. `pupitred env` runs as `dev`, reads only that file, picks the deepest declared folder that contains the current folder — a process's, then a project's, then the machine's — and prints `export`s and `unset`s: whatever no longer applies to the new folder is dropped, tracked through `_PUPITRE_ENV_KEYS`. A missing or unreadable file prints nothing. An agent opened by `agent.open` receives the project's environment through `new-session -e`, like a process window.

#### What a repository asks for, before adding it

`project.detect` answers what the add screen must guess before `project.add`: which processes, and for each which package manager, which start command, which port. It takes **a single** source — `repo` for a repository the server does not know yet, `dir` for a folder already present under the projects root — and the contract refuses both at once as well as neither.

It installs nothing and declares nothing. A `repo` is cloned **shallowly and partially** — `--depth 1`, without tags, `--filter=blob:limit=65536` and `--no-checkout`: the trees and the small blobs arrive in a single pack, and only the files the detection reads are written (`package.json`, `turbo.json`, `pnpm-workspace.yaml`, `vite.config.*`, the lock files, `pyproject.toml`, `gradlew`, `settings.gradle*`, `build.gradle*`, down to two folders deep for the members of a workspace, and a server's configuration — `grails-app/conf/application.yml`, `src/main/resources/application.yml` or `.properties` — at whatever depth it sits). A repository heavy with images or history costs what an empty one costs; a server that does not know the filter says so and sends everything, which reads the same. The clone goes into the cache of the projects user, `~/.cache/pupitre/detect/<draw>`, never under the projects root: a half-made clone must not be able to pass for a project. The folder is erased as soon as reading is done, whether the reading succeeded or not. Each detection draws its own name, so two simultaneous detections do not step on each other; and since an agent killed in the middle of a clone erases nothing, each detection first sweeps what the cache has kept for more than an hour — an age no in-flight clone can reach.

The result is `{ processes[] }`, one per folder that asks for something: the root, then each top-level folder that carries its own manifest — a `package.json`, a `pyproject.toml`, or a `gradlew` of its own. A repository that asks for nothing returns one process without a command, at the root. Each process carries:

| Field | Description |
| --- | --- |
| `id` | the manifest's name folded into a DNS label, the folder's name otherwise, `app` for a nameless root; the subproject's name for a Gradle server |
| `dir` | the folder, relative to the root; `.` for the root itself |
| `pkgmgr` | what the folder proves: the `packageManager` field of `package.json`, otherwise its lock file (`bun.lock`, `pnpm-lock.yaml`, `package-lock.json`), otherwise `bun` for a `package.json` without a lock. Without `package.json`: `uv` for a `pyproject.toml`, `gradle` for a `gradlew`, `none` otherwise |
| `install` | this manager's install command, absent when it has none |
| `cmd` | the start command: the first `dev`, `start` or `serve` script of `package.json`, on the port of `port_hint`. Absent when the folder declares none |
| `port_hint` | the port the folder asks for — its script's `--port`, its Vite configuration's `server.port` — if it is free on this server and no other process of the same detection asks for it; otherwise the first free port of the registry. A script that only launches another script (`"dev": "bun run dev:app"`) is read to the end of the chain, five hops at most |
| `host_hint` | the `.localhost` name that the start script freezes in its `--host` (`react-box.localhost`), when it freezes one. This is the `host` to declare: such a name does not resolve by itself on a server, and a development server that binds to it with no answer waits forever |
| `routes` | the ports of a monorepo's workspaces, when the root launches them all at once |

**A Gradle build runs from where its wrapper is.** A folder that holds a `gradlew` proposes one process per server the build declares: the build itself when its `build.gradle` names Spring Boot or Grails, and each of the subprojects that `settings.gradle` includes whose build file names them — `./gradlew :server:bootRun`, from the wrapper's folder. The port proposed is the one the server's configuration declares (`server.port`) when it is free, since its client is written against it, the next free one otherwise. An Android build names none and proposes nothing; a folder that holds a `build.gradle` without a wrapper is a subproject of the build above it, not a process.

None of this is a decision: the detection proposes, the customer corrects on screen — removes the process of a tool that is not run on a server, changes a port a proxy imposes — and `project.add` remains the authority, it is what refuses a port already taken, with the remedy that carries the free port.

**A process's `host` is `127.0.0.1`, or a `.localhost` name the machine makes answer.** A repository that freezes `--host react-box.localhost` in its script assumes what the customer's laptop does on its own — resolve `*.localhost` to the loopback — and what a server does not. The agent therefore keeps in `/etc/hosts` a tagged `projects` block, rewritten at each `project.add`, `project.update` and `project.remove`: one line `127.0.0.1 <host>` per process whose `host` ends in `.localhost`, IPv4 only, so that the development server binds where the port is probed and where the tunnel hits. Any `host` that is neither `127.0.0.1` nor a `.localhost` name is refused with `bad_request`.

#### One process, one command, several ports

A `Process` holds a main port, `port` — it is what decides the `online` state and the local address — and a list `routes[]`: each port the screen has picked up, `{ label, port, hostname? }`. `label` is a short word, a single DNS label: `web`, `api`, `docs`. `hostname` is the **full** name under which this port answers on the web, as the registry keeps it; a route without `hostname` is a port nobody publishes. The Turborepo case remains a single process: `turbo run dev` launches `web`, `api` and `docs` in a single window, and the process carries three routes.

**The hostname is resolved once, at add time, and stored.** `project.add` receives routes `{ label, port, subdomain? }`; for each `subdomain`, the agent composes `<subdomain>.<domain>` from the domain the server publishes — the one the exposure module wrote into `PUPITRE_DOMAIN` — and keeps the result. A server without a domain refuses a route that carries a `subdomain`, with the `fix` telling to install an exposure or to leave the port unnamed. Nothing, afterwards, recomposes an address from a subdomain: `url` is read from the stored `hostname` of the main route, the one whose port is `port`. **A domain that changes takes all the names with it**: when the exposure module receives another `domain`, its `move-routes` step rewrites every `hostname` in the registry that ended with the old domain under the new one, before saving the domain and writing the ingress — a project never answers under a domain the server no longer publishes. The DNS records, for their part, are the app's business: it reads the names from before, removes those it had written, and puts the new ones in place.

The naming scheme is the one the app proposes: `<subdomain>.<domain>` for the first process's main route, `<label>-<subdomain>.<domain>` for all the others, those of the other processes included. It is a proposal of the screen, not a rule of the agent — each route receives the subdomain the customer left in its field.

The registry refuses a port already held by a project of the server, main or route, with the free port in the remedy; two processes of the same project on the same port; two processes of the same project under the same `id`; a hostname already taken; two routes of the same process under the same label; a `hostname` that is not under the server's domain — this machine's tunnel and DNS carry nothing else; and a second project on the folder of a first — a folder is a project, whatever else runs in it is one more process.

`project.detect` can read a monorepo: a `turbo.json` at the root and `workspaces` in `package.json` — or a `pnpm-workspace.yaml` — make it propose a single process, `cmd = turbo run dev` under the detected manager and one route per workspace whose `dev`, `start` or `serve` script names a port, labelled with the workspace's name, on a free port of the server; the top-level folders are then not read, the workspaces being already there. Like the rest, it proposes, and `project.add` remains the authority.

#### Configuration can be reopened

`project.update { name, patch }` changes what can be changed without removing the project: `branch`, `processes`. A field absent from the `patch` stays what it was. `processes` **replaces the entire list** — the screen sends what it shows, and a process that is no longer there is a process that leaves, stopped if it was running — and each process carries its entire routes, `{ label, port, subdomain? | hostname? }`: `subdomain` to let the agent compose the name, a full `hostname` for whoever wants something else under the server's domain, never both. An empty `install` hands the command back to the package manager.

The command **restarts a process only if its command or its folder has changed and it was running**, that one alone: a route, a branch, a process added alongside touch nothing that is running — the new one is declared, not started. It answers the updated `Project`, and refuses a line that comes from the repository's `projects.conf`, like `project.remove`. What a removed hostname leaves behind — the DNS record — is the business of the app, which wrote it: it compares the names from before and after, removes those that go, then asks for `tunnel.sync`.

#### A runtime's version, per project

A project names the version of each runtime it wants, per mise tool: `runtimes: { node: "22", java: "17" }`, set by `project.add`, replaced entirely by `project.update` — a tool absent from the map goes back to the machine's default — and returned on each `Project`, `{}` when it names nothing (migration no. 5 for earlier lines). The tools are those of `RUNTIME_TOOLS` in `packages/shared`, and the version is one of the `versions[]` that the `runtime.<tool>` service returns: a version the machine does not hold is refused with `bad_request`, with the `fix` naming the service where to tick it.

The agent keeps the pin where mise reads it: a `mise.local.toml` at the project root, `[tools]` with one tool per line, written at `project.add` when the folder is there, otherwise with the clone, rewritten at each `project.update` that touches `runtimes`, removed when the map empties. The file is its own: `.git/info/exclude` hides it from the project's diff as from the repository, and `mise trust` declares it to mise. It takes precedence over whatever the repository declares, and applies to the processes launched by the agent — `zsh -lc` in the project's folder — as to the terminals opened there.

#### The branch, and the name on the web

`project.add` and `project.detect` take a `branch`. Absent, the repository's default branch is cloned; present, it travels down to `git clone --branch`, and the registry line keeps it, so that a project put back in place months later returns to the same branch. It only makes sense with a repository: a folder already on the machine is read as it is, and the contract refuses `branch` next to `dir`.

A route's `subdomain` accepts **several labels separated by dots**. A single one remains what the app proposes, because that is what the universal certificate of a Cloudflare tunnel covers; `api.shop`, conversely, requires an Advanced Certificate Manager on the customer's zone, and that is their decision, not the product's. Each label is a DNS label — it starts and ends with a letter or a digit, hyphens live in the middle — and the whole is bounded to 190 characters, which leaves room for a zone behind it.

### Agents, sessions, processes

| Command | Parameters |
| --- | --- |
| `agent.open` | `{ kind: "claude" \| "codex" \| "cursor" \| "gemini" \| "copilot" \| "opencode" \| "hermes", project }`: returns the tmux command the app attaches in a terminal |
| `sessions.list` | — : pid, duration, RAM, kind, command |
| `sessions.clean` | — |
| `processes.list` | — |
| `process.kill` | `{ pid, force? }` |
| `shots.list` / `shots.url` | — |
| `shots.clean` | `{ path? }` → `{ removed }`: without `path`, the gallery cleanup; with it, that one capture only; see [The content of a screenshot](#the-content-of-a-screenshot) |
| `shots.read` | `{ path }`: the content of a capture; see [The content of a screenshot](#the-content-of-a-screenshot) |

### Files

| Command | Parameters | Result |
| --- | --- | --- |
| `fs.list` | `{ path }` | `{ path, entries[], truncated }`: the content of a folder; see [Files](#files-1) |
| `fs.stat` | `{ path, hash? }` | `{ path, kind, size_bytes, modified_at, mode, media_type?, sha256? }` |
| `fs.read` | `{ path }` | `file` events, then `{ path, media_type, size_bytes, sha256, chunks }` |
| `fs.write` | `{ path, content, sha256? }` | `{ path, size_bytes, sha256 }` |
| `fs.mkdir` | `{ path }` | `{ path }` |
| `fs.rename` | `{ path, to }` | `{ path }`: the entry's new place |
| `fs.remove` | `{ path, recursive? }` | `{ path, removed }` |

### Services, secrets, databases, tunnel

| Command | Parameters |
| --- | --- |
| `service.start` / `service.stop` / `service.restart` | `{ id }` → the updated `ServiceStatusResult`; see [A service is driven through its unit](#a-service-is-driven-through-its-unit) |
| `service.logs` | `{ id, lines?, follow? }` → `{ lines[] }`, and `log { line }` events if `follow`, the shape of `project.logs` |
| `service.secret` | `{ id, key }`: reveals the value of a credential of module `id`; see [The value of a credential](#the-value-of-a-credential) |
| `secrets.sync` | `{ project }` |
| `db.dump` / `db.import` / `db.shell` / `db.url` | `{ engine, name? }` |
| `tunnel.status` / `tunnel.sync` / `tunnel.restart` | — ; each route carries `protected`. See [The access gate](#the-access-gate) |
| `access.list` | — → `{ keys: [{ id, name, projects, created_at }] }`, without fingerprint |
| `access.create` | `{ id, name, hash, projects }`: `hash` is the SHA-256 fingerprint of the whole key, `projects` a list or `null` for the whole server → the listed key; an `id` already taken refuses with `bad_request` |
| `access.update` | `{ id, name?, projects? }`: an absent field stays, `projects: null` opens the whole server |
| `access.revoke` | `{ id }` → `{ id }`; a key already gone answers too |

### Backups

The format, the encryption and the course of a run are in [backups.md](./backups.md). None of these commands is open in restricted mode, before enrolment or during an overdue migration. Those that read a bucket announce `secrets_stdin: true` and read the `BackupSecrets` line — `{ access_key_id, secret_access_key, private_key? }` — right after the request, like `install`.

| Command | Parameters | Result |
| --- | --- | --- |
| `backup.status` | — | `{ configured, interval_hours, keep, next_run_at?, running, last?: { at, ok, id?, bytes?, error?, warnings? } }` |
| `backup.contents` | — | `{ projects[]: { name, repo, included }, databases[]: { engine, name, item, included }, unreadable[] }`: what this server holds and backups can take along, each with its state according to `exclude_projects`, `exclude_databases` and the `projects` and `databases` switches. An engine that does not answer is named in `unreadable` instead of making the list fail. Also answers without `core.backup` installed: everything is then `included` |
| `backup.run` | `{ name?, databases?, projects? }`: the name the reader gives the backup, and a way to deviate from the setting, once; a name outside the contract is refused `bad_request` | `step` events of the `core.backup` module, then `{ id, key, bytes, parts[], warnings[], declared }`. Refusals: `busy` when a backup or an installation holds the lock, `module_not_found` without `core.backup` configured, `storage_refused` when the bucket refuses |
| `backup.delete` | `{ id }` | erases the objects of this backup of this server in the bucket, then the reference on the platform: `{ deleted }` |
| `backup.inspect` | `{ location, secrets_stdin: true }` | the manifest, verified against `location.sha256`. `backup_missing` without a manifest, `backup_corrupt` on a differing fingerprint, `backup_unsupported` on a format this binary does not read |
| `backup.restore.setup` | `{ location, revert?, secrets_stdin: true }` — the line carries `private_key` | `{ id, modules[], defer[], extra[], projects[], dropped[], parts[], warnings[] }`. Without `revert`, `bad_request` refusal on a machine already installed; `backup_unsupported` on a configuration newer than this binary |
| `backup.restore.data` | `{ location, parts[], start?, secrets_stdin: true }` — the line carries `private_key` | one step per part, then `{ restored[], failed[], started[], warnings[] }` |
| `backup.restore.abort` | — | `{ done: true }` |

### System

| Command | Parameters |
| --- | --- |
| `enroll` | `{ platform_url, secrets_stdin: true }`: the enrolment token is read from the secret stream; the agent exchanges it for its server token, writes `platform_url` into `/etc/pupitre/platform.url` — the heartbeat and the licence run without the app, and nothing else would tell them where to answer — then reads `/agent/state` a first time, from which it takes `license`. Result `{ enrolled: true, license, synced_at? }`. Also answers in [restricted mode](#restricted-mode), and is the command that leaves it |
| `keys.list` | — : the keys of the tagged block, `{ keys[]: { fingerprint, comment?, device_id?, signer? }, synced_at? }`. `signer` says the agent holds this key as safe and accepts what it signs. `device_id` is reserved: no agent emits it yet |
| `keys.sync` | — : forces a read of `/api/v1/agent/state`, and returns the same list with `pending[]`, the fingerprints of the keys the platform asks for and that no valid approval covers yet |
| `keys.trust` | `{ public_key }`: a bare key, `type base64`, Ed25519 or ECDSA NIST, without option or comment. It becomes a signer and enters the block right away. This is the app's gesture, on its own SSH session, right after enrolment: the root of trust is set over SSH, never by the platform. Returns the `keys.list` list. See [approved keys](#a-key-only-enters-on-an-approval) |
| `platform.sync` | — : the same read, followed by the heartbeat. `{ synced_at, heartbeat_at? }`. The app asks for it at the end of an installation and of a hardening, so that the console shows the modules instead of an empty server for five minutes. It reads and reports, touches nothing on the machine, and therefore stays open in restricted mode: a server whose licence the platform has not confirmed is exactly the one that must ask again. An absent `heartbeat_at` says the state was read and the beat did not go out; the daemon will redo it |
| `agent.upgrade` | `{ version?, signature?, allow_downgrade? }`: downloads, verifies, replaces, restarts. `busy` during another update, an installation, a backup or a restore. A new binary that does not answer `hello` — put in place in the protocol it says it speaks through `pupitred version --json`, so that an update to a next generation is not mistaken for a failure — is replaced by the old one, and the configuration it migrated is put back to the previous revision ([configuration migrations](./config-migrations.md#the-order-of-an-update)) |
| `agent.migrate` | — : brings the machine's configuration to the shape this binary reads, and returns `{ revision, expected, state, applied[], pending[], backup?, failure?, restored }`. It always answers, even when a migration has refused: it is the other commands that then refuse. See [configuration migrations](./config-migrations.md) |
| `reboot` | — |
| `doctor` | — : short diagnostic |
| `diag` | — : full report to paste into a ticket |

## The secret stream

A command that carries a secret (`install`, `enroll`, `harden.sudo`) announces `secrets_stdin: true`. The app then writes **the next line of standard input** with the secrets as JSON, immediately after the request; the agent consumes it before calling the handler, without logging it or sending it back. No secret appears in `params`, in an event or in a report.

It is indeed standard input and not a separate descriptor: `ssh` only forwards descriptors 0, 1 and 2, so an `fd 3` opened by the app would never reach the agent. Since requests are serialised, the line that follows a request with `secrets_stdin: true` is unambiguously its secrets line.

For `install`, the line has the shape of `params.config`, grouped by module identifier, one value per `secret` field of the manifest (`InstallSecrets` schema):

```jsonc
{ "db.postgres": { "app_password": "…", "remote_password": "…" }, "tool.github": { "token": "…" } }
```

A module absent from the line has no secret. A line that is absent, unreadable or that does not respect this shape returns `bad_request` with the `fix` that shows the expected shape, before any installation; the next request is still read as a request.

For `enroll`, the line carries the enrolment token alone (`EnrollSecrets` schema):

```jsonc
{ "enrollment_token": "enr_…" }
```

The enrolment token is a secret like any other: it does not enter `params`, appears in no event, is written to no log, and never becomes a command-line argument — an argument would be readable in `ps` by anyone with an account on the machine. This is also why `pupitred enroll` reads it on its standard input: the protocol command and the subcommand take the same path. `platform_url` stays in `params`, because it is not a secret and it is what a log must be able to say when the exchange fails.

The agent has no server token yet at the moment it enrols: `enroll` is therefore one of the commands an unenrolled binary opens, and the only one that changes that state.

A `list` field of `items: "secret"` — `ai.hermes.providers`, for example — is transmitted with indexed keys, one per value, in the order of the list:

```jsonc
{ "ai.hermes": { "providers.0": "sk-…", "providers.1": "sk-…" } }
```

For `harden.sudo`, the line carries the `crypt` hash of `dev`'s password, never the password (`HardenSudoSecrets` schema, `SUDO_PASSWORD_HASH_PATTERN` pattern):

```jsonc
{ "password_hash": "$6$rounds=100000$…$…" }
```

## The sudo password

`harden.sudo` is the only path to the sudo rule of [decision 0015](../decisions/0015-sudo-by-password.md). No migration sets it: the agent cannot invent a password the customer would not know, so a server installed before it keeps `dev ALL=(ALL) NOPASSWD:ALL` until the app calls the command. `core.system` sets that earlier rule on a new server and never rewrites the new one.

**What the app does.** It draws the password on the computer — six groups of four characters without those that get confused —, computes its SHA-512 `crypt` hash (`$6$rounds=100000$…`), the only thing that leaves, and keeps the password in the keychain. It calls the command right after `harden`, on the session reopened as `dev`.

**What the agent does, in this order**, each step a `step` event:

1. `check-sshd-passwords` — `sshd -T -C user=dev` must return `passwordauthentication no`, and `no` for `kbdinteractiveauthentication` and `challengeresponseauthentication` when they appear: a password on an SSH that accepts them would be a door from anywhere. Otherwise `bad_request`, nothing is touched.
2. `check-agent-binary` — `/usr/local/bin/pupitred` and each of the folders above it belong to root, are not links, and neither the group nor others write them. Otherwise `internal`, nothing is touched: the rule would name a binary that `dev` could replace.
3. `set-password` — `chpasswd -e` receives `dev:<hash>` on its standard input. Skipped when `/etc/shadow` already holds this hash.
4. `restrict-sudo` — the rule is written to `/etc/sudoers.d/.90-dev.pupitre`, a name sudo does not read, verified by `visudo -c -f`, then written atomically to `/etc/sudoers.d/90-dev`, 0440 root. Skipped when the file already holds it.

```
dev ALL=(ALL:ALL) ALL
dev ALL=(root) NOPASSWD: /usr/local/bin/pupitred serve, /usr/local/bin/pupitred binary install
```

sudo retains the last rule that applies: the `pupitred` one therefore comes after the one that asks for the password. A command that sudoers writes with arguments matches only those arguments, exactly; a wildcard there would also match a space, hence any added argument. The rule names two exact lines and no wildcard: `sudo -n pupitred serve` and `sudo -n pupitred binary install` pass, `pupitred serve --privileged`, `pupitred serve ""`, `pupitred binary install --privileged` and any other subcommand — `keys reset`, `migrate`, `install`, `dev`, `version` — fall under the first rule and ask for the password. `SETENV` is not granted: `sudo PUPITRE_…=… pupitred serve` and `sudo -E` are refused. The password goes before the rule: a rule that asked for a password `dev` does not have would lock the customer out. A failure of `restrict-sudo` therefore leaves `dev` with the new password and the old rule; the app keeps the password as soon as `set-password` has not failed.

Replayed, the command changes nothing but the password it is given: this is how a lost password is replaced from the app. The hash goes neither into `params`, nor to the log, nor into an error message, where the refusal of a malformed line quotes only the expected pattern.

**Putting an agent binary in place as `dev`.** Since `sudo` no longer opens a shell for `dev`, the app pushes the binary into a file of `dev`'s and entrusts it to `sudo -n pupitred binary install`, on standard input, behind a first line that carries what the signature covers: `{"version":"<v>","signature":"<b64>"}`. Neither the version nor the signature are arguments: the line sudo lets through without a password stays exact. `pupitred` verifies the signature with the key it carries, over the version, its architecture and the fingerprint of the bytes received ([what the signature covers](#what-an-updates-signature-covers)), refuses a version below its own, then replaces itself the way `agent.upgrade` does, rollback included, and writes `<fingerprint>  <path>` on its output. A line that is unreadable, without a version or with an unknown field is refused, code 1, before any replacement. Any flag makes another command line, which sudo opens only on the password: `--allow-downgrade` lifts the floor, `--privileged` alone says the password was given. An agent built without a key — a build from the repository, the development agent — has nothing to verify the bytes with: it refuses `binary install` with `privilege_required`, and puts the binary in place only through `binary install --privileged`. The app routes an unsigned agent through it with the password on the first line, read by `sudo -S` — or by the shell under the earlier rule, where sudo asks for none. An agent that predates the subcommand answers with its usage, code 2; on such a server `dev` still holds `NOPASSWD:ALL`, and the app falls back to the installation by `sh -c`, on the bytes that follow the first line. The very first installation, on a bare server reached as root, has no `pupitred` to verify anything: the app writes there the binary it verified itself.

## Two sessions: passwordless and privileged

`pupitred serve` is the line sudo launches for `dev` without a password: everything that runs as `dev` — an AI agent, a `postinstall`, a terminal — can open it. This is the **limited session**. `pupitred serve --privileged` is another line, which sudo launches only on `dev`'s password: the **privileged session**. The argument is what sudo compared; no other flag is admitted, `pupitred serve` refuses any unknown argument with its usage, code 2. As root — the onboarding before hardening —, the app launches `pupitred serve --privileged` directly.

The limited session answers the commands of `LIMITED_COMMANDS` (`packages/shared`, exported as `LimitedCommands`), and refuses the others with `privilege_required`, with the `fix` that names the privileged session, before any other check and after consuming any secrets line. It is an allowlist: a command added to the contract is privileged until it is declared there. Each command in the list is at worst a nuisance in `dev`'s hands:

| Limited session | Why |
| --- | --- |
| `hello`, `ping`, `probe`, `catalog`, `report`, `snapshot`, `status`, `service.status`, `module.config`, `completions`, `doctor`, `diag`, `backup.status`, `backup.contents`, `keys.list`, `tunnel.status`, `db.url`, `db.shell` | reads that return no secret root holds: `module.config` omits the secret fields, `service.status` names only variables, `db.url` and `db.shell` return an address without a password and a line to type |
| `project.*`, `agent.open`, `sessions.*`, `processes.list`, `process.kill`, `shots.*`, `fs.*`, `secrets.sync` | `dev`'s work on what belongs to `dev`: processes run as `dev`, `fs.*` sees only its folder through `os.Root`, `process.kill` targets only a `dev` process, the templates are read in the project root, the 1Password token is also in `dev`'s environment |
| `service.start`, `service.stop`, `service.restart`, `service.logs`, `tunnel.sync`, `tunnel.restart` | an already configured unit, stopped or relaunched; the tunnel publishes only the registry's routes, under the server's domain |
| `platform.sync`, `keys.sync` | what the daemon does every 30 seconds: a key enters only on a signed approval |
| `agent.upgrade`, `agent.migrate` | an Ed25519-signed binary above the floor, a forward migration — without `allow_downgrade`, which makes the command privileged |

| Privileged session only | Why |
| --- | --- |
| `install`, `install.check`, `upgrade`, `uninstall` | a configuration supplied by the caller becomes root files and root commands; `install.check` has it weighed by preflights that hold the machine's secrets |
| `harden`, `harden.sudo` | SSH, root and `dev`'s own sudo password |
| `service.secret`, `db.dump`, `db.import` | a secret from `/etc/pupitre/env`, an entire database, a dump from `~/dumps` played by the engine's superuser |
| `backup.run`, `backup.delete`, `backup.inspect`, `backup.restore.*` | one more backup prunes the old ones, a deletion loses them, a restore rewrites the configuration |
| `keys.trust`, `enroll` | whom the server trusts, and which platform it answers to |
| `reboot`, `agent.upgrade { allow_downgrade: true }` | the machine stopped; a binary that is signed but known to be faulty |
| `access.*`, `project.add` or `project.update` that carry `protected: false` on the project or on a process | who can open a published address, and an address opened to the web without a key: an AI agent as `dev` does not lift the protection by itself |

**What the app does.** It opens the four channels of the limited session as before, through `sudo -n pupitred serve`, and a fifth, privileged, on demand, for each command that `requiresPrivilege` (`packages/shared`) designates. For `dev`, this channel launches:

```sh
if sudo -n true 2>/dev/null; then IFS= read -r p; exec sudo -n pupitred serve --privileged; fi
exec sudo -S -p 'pupitre-sudo:' pupitred serve --privileged
```

and writes on the first line of standard input the password kept in the keychain — an empty line when the computer holds none —, then the protocol. `sudo -S` reads this line byte by byte and leaves the rest to `pupitred`. Under the earlier rule, sudo asks nothing and the line would go to `pupitred` as a request: the shell reads it first. The password is never an argument, an environment variable or a log line. `pupitre-sudo:` is the prompt sudo writes before each read: a second one on the error output means the password was refused — and `hello` read as the next attempt —, the app cuts the channel and says so (`privilege_required`, "refused" or "absent from this computer") without retrying with the same password. The privileged channel closes after one minute without use.

**On the machine.** `pupitred dev` likewise speaks to `sudo -n pupitred serve` when the account typing it does not read the attachment; a privileged verb — `dev db dump`, `dev db import`, `dev backup now` — opens `sudo pupitred serve --privileged`, for which sudo asks the password on the terminal, and refuses without a terminal.

## A service is driven through its unit

`service.status` returns the systemd unit the module declares in `unit`, and it is to that unit that `service.start`, `service.stop` and `service.restart` address themselves. A `failed` service thus has a remedy on its page, without reinstalling anything: the module is not replayed, only its unit moves.

**The response is the state, not the intent.** The agent waits for systemd to have returned its verdict — `systemctl start` holds the command until the unit has started or failed, three minutes at most — then reads the service again and answers what `service.status` would have answered — `running`, `stopped`, `failed` — without the `credentials` table, which stays with `service.status` alone. A `start` whose unit falls back therefore never answers `running`. When systemd refuses the action itself, the error is `internal`, carries what systemd said, and its `fix` points to `service.logs`.

**What is refused, before touching systemd.** An `id` that is not an installed module returns `service_not_found`, like `service.status`. An installed module without a unit — `core.*`, a tool that holds no process — returns `bad_request`: there is nothing to start, nothing to stop, nothing to read.

**The run lock.** The three commands take it, exactly like `tunnel.restart`: during an installation, they answer `busy` rather than move a unit the installation is in the middle of writing. `service.logs` does not take it — a read always answers — and refuses the same `id`s as the other three.

**The log.** `service.logs { id, lines?, follow? }` reads `journalctl -u <unit> -n <lines> --no-pager -o cat`, a hundred and twenty lines by default like `project.logs`, and answers `{ lines[] }`. With `follow`, each line travels on a `log { line }` event, the tail included, `journalctl -f` holds the line, and the `{ lines: [] }` response closes the stream after the same quarter of an hour as a project follow. Like any long command, a follow blocks the channel it goes through, and holds it for as long as the reader stays: the app opens it on its follows channel, like `project.logs`, so that the `install` that applies the form displayed next to the log does not wait for it.

## A CLI's account

`service.status` returns `login` for a module whose CLI connects to an account — Claude Code, Codex, `gh`, `op`, `neonctl`, Wrangler, the VS Code tunnel — and nothing for the others:

```ts
type Login = {
  state: "signed_in" | "signed_out" | "unknown"
  account?: string   // what the CLI names: a login, an email, an account
  fix?: string       // how to sign in, in the session's language
}
```

`signed_in` names the account when the CLI does. `signed_out` is a CLI that holds nothing, or whose own verification refuses what it holds. `unknown` is a CLI that could not be queried: the key is there, the provider did not answer — the `fix` says what to do in both cases, and the app displays it as is.

It is the CLI that answers, through its own command, and **`service.status` alone** asks it: the question can cost a round trip to the provider, and a `snapshot` read every three seconds never pays it. The app's dashboard, which says under each running service whether it is connected, asks it once per service when it opens and keeps the answer until the return to the page. An agent that predates the field does not return it, and the app then says nothing about the account. The list of commands per module is in [service-catalog.md](./service-catalog.md#a-clis-account).

## The value of a credential

`service.status` returns a service's credentials masked: a `credentials` table that goes from a label to the **name** of a key in `/etc/pupitre/env`, never to its value. `service.secret { id, key }` reveals the value of one of these keys, and nothing else.

The agent refuses any key that does not belong to module `id`: the only list allowed is that of the values of the `credentials` table that `service.status` returns for this module. A module therefore never reads another's secret. A key unknown to the module, a key absent from `/etc/pupitre/env` or an empty value returns `bad_request`. An unknown or non-installed module returns `service_not_found`.

The value **does not leave in the result**. It travels on a dedicated event, symmetrical to the incoming secret stream:

```jsonc
// request
{ "id": 14, "cmd": "service.secret", "params": { "id": "db.mysql", "key": "MYSQL_APP_PASSWORD" } }

// secret event, exactly one, before the response
{ "id": 14, "event": "secret", "key": "MYSQL_APP_PASSWORD", "value": "…" }

// response: an acknowledgement without a value
{ "id": 14, "ok": true, "result": { "key": "MYSQL_APP_PASSWORD" } }
```

The principle is that of the incoming secret stream, in the other direction: on the way in, a value does not go in `params`, which is logged and replayed; on the way out, it does not go in `result`, the unit that a request and response recorder captures. The `secret` event is the only line such a recorder knows how to drop, and it is through it that the app puts the value back on screen without making it transit through its generic IPC bridge. The agent never writes it to its log, never persists it, never sends it back in `params`, a report or another event.

## The access gate

Every published name goes through `pupitre-gate` (decision [0017](../decisions/0017-access-gate.md)). The exposure that holds the machine, tunnel or Caddy, installs it at its `Configure` and reloads it at each `tunnel.sync`. A `tunnel.sync` launched before the module's update also installs the gate: the ingress never points to an absent gate. `pupitred serve` does that `tunnel.sync` itself when it opens and the gate is missing or is not the one this binary writes: the app's first session after an agent update puts the gate in place, with no extra gesture. The synchronisation runs alongside the session, never before `hello`, and the process waits for it before terminating. A gate already in place costs a session nothing. It is not the daemon: its systemd unit keeps `/etc/systemd` and `/etc/cloudflared` read-only. Uninstalling the exposure stops the gate and keeps the keys.

**The protection**
- The registry carries `protected` on each project, and `protected` on a process that deviates from it. `Project.protected` and `ProjectProcess.protected` return it.
- An agent without a gate does not return them, and the app sends it nothing about the protection.
- Migration 7 protects each project that said nothing.

**The files**
- `/etc/pupitre/gate/access.json` (0600): the cookie secret, drawn once, and the keys, `{ id, name, hash, projects, created_at }`.
- `/etc/pupitre/gate/routes.json` (0600): each name, its `host:port` upstream, its project and its protection.
- The gate reads them again on `SIGHUP`, and `access.*` and `tunnel.sync` send it that through `systemctl reload`.

**A request on a protected name**

| What the request carries | Response |
| --- | --- |
| `Pupitre-Key: <key>` that opens the project | forwarded, without the header |
| `?pupitre_key=<key>` on a navigation (`GET`/`HEAD`, `Sec-Fetch-Mode: navigate` or `Accept: text/html`) | `303` to the same address without that one parameter, path and other parameters kept in their order and encoding, and the `__Host-pupitre` cookie (400 days, renewed at each navigation) |
| `?pupitre_key=<key>` elsewhere (API, WebSocket, EventSource) | forwarded in place, without the parameter |
| `__Host-pupitre` cookie of a key that still exists | forwarded, without the cookie; the other cookies stay as they are |
| nothing, or a refused key, on a navigation | `401`, login page at the requested address, in the visitor's language; its form posts to `/.pupitre/login` with `next`, a path on the same site only |
| nothing, or a refused key, elsewhere | `401` `{ error: { code: "access_required", message, fix } }` |
| a CORS preflight (`OPTIONS` with `Access-Control-Request-Method`) | forwarded without a key |

**What the site receives**
- An incoming `Pupitre-Identity` header is always removed. The site receives the key's name, encoded, in `Pupitre-Identity`, `X-Forwarded-Host` and its own `Host`.
- More than twenty refused keys in ten minutes from the same address answer `429` (`access_throttled`).

## The content of a screenshot

`shots.list` names the captures, `shots.url` gives the address of the gallery served on the server. Neither puts an image in front of the app's eyes: `shots.read { path }` does, and it returns the content, not an address.

**Why not an address per capture.** The gallery is a read-only server on `127.0.0.1:8099`, reachable from the server and from nowhere else. An address per capture on this loopback would be usable by the app only by opening an `ssh -L` — and bringing a server port to the laptop is precisely what the protocol [leaves to the app](#a-ports-local-tunnel-is-not-part-of-the-protocol). A truly reachable address would mean publishing it, through the tunnel or through a port: that would be one more listener, reachable by whoever does not have the customer's key, whereas the rule is that no inbound connection reaches the server and the only open port is SSH. A capture shows an application screen, often an open session: it deserves exactly the door of the other commands, and not one more.

**What crosses the channel.** The bytes go out in base64 on `shot` events, as a credential's value goes out on a `secret` event: what is heavy or what compromises does not go in `result`, the unit that a request and response recorder captures whole.

```jsonc
// request
{ "id": 21, "cmd": "shots.read", "params": { "path": "2026-09-04/login.png" } }

// shot events, one per chunk, in order
{ "id": 21, "event": "shot", "seq": 0, "bytes": "iVBORw0KGgoAAAANSUhEUg…" }
{ "id": 21, "event": "shot", "seq": 1, "bytes": "…" }

// response: what is needed to verify what has just gone through
{ "id": 21, "ok": true, "result": { "path": "2026-09-04/login.png", "media_type": "image/png", "size_bytes": 98304, "sha256": "…", "chunks": 2 } }
```

`path` is the one `shots.list` returns, taken as is. `sha256` is the fingerprint of the file's bytes, in lowercase hexadecimal: the app glues the chunks back together, compares, and knows without ambiguity whether the image is whole. `chunks` says how many events were emitted, so a truncated stream shows in the acknowledgement.

**What keeps the channel usable.** A capture is cut into chunks of 48 KiB, that is a line of about 64 KiB: the channel stays a sequence of bounded lines, never a single multi-megabyte line that a fixed-buffer reader could not read again. The cut falls on a multiple of three, so base64 pads only the last chunk: each `bytes` decodes on its own, and their concatenation decodes too. Beyond 16 MiB the file is refused with `bad_request` before any read, on the size `shots.list` reports: a capture does not monopolise the channel. Like any long command, a read blocks the channel it goes through; an app that reads a gallery while it refreshes a dashboard opens a second channel, exactly as for `install`.

**What the command opens, and nothing else.** It reads only what `shots.list` names: the `path` is looked up in the gallery's listing, not resolved on disk. An absolute path, a `..`, a file outside the gallery or an entry that is not an ordinary file are not in it and return `bad_request`. The only types returned are `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/avif` and `image/svg+xml`; everything else is refused. No port is opened, no listener is added: the command goes through the SSH session the app already holds, so it gives access to nothing more than a client that already has the server's key.

**A capture is filed under its project.** The gallery holds `~/shots/<project>/<day>/<name>`, and `~/shots/_unfiled/<day>/<name>` for what has no project — no project name starts with `_`. Each `Shot` carries `project`: the project's name, `null` outside a project; an agent that predates the field does not return it. `shot` chooses the project in this order: the one `--project` names (refused if it is not declared), the one whose folder contains the current folder, the one whose process serves the captured URL — by its public name or by its host and port —, otherwise none. The projects belong to root: `shot`, launched by `dev`, asks `sudo -n pupitred serve` for them through `project.list`, like the `dev` verbs. Earlier captures, filed by day at the root, move under `_unfiled` at the next capture and the next `Configure` of `ai.browser`.

**The gallery is published only if the owner asks for it.** The app keeps showing a capture through `shots.read`, for the reasons above. But a capture that an agent must show to a human outside the app — Claude on the web, a link pasted into a review — needs an address. The `subdomain` field of `ai.browser` provides it: the agent draws a 128-bit token, writes `/etc/pupitre/shots.env` (0600, read by systemd as the `EnvironmentFile` of `pupitre-shots` before dropping to `dev`, never on a command line), and the installed exposure — Cloudflare Tunnel or Caddy, which are mutually exclusive — serves `https://<subdomain>.<domain>` to `127.0.0.1:8099`. The gallery then answers only under `/<token>/`: any other path is a 404, the list included, and every response says `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`. Nothing more listens: the route goes through the tunnel's outbound connection or through the Caddy the customer chose. A moved domain takes the name with it, token kept; changing the subdomain keeps the token; emptying the field removes the route and forgets the token, so putting it back draws a new one and cuts every address given before.

`shots.url` returns `{ url, exposed }`. `exposed` is true when the name is published under the server's domain and an exposure serves it: `url` is then `https://<subdomain>.<domain>/<token>`, which `shot` prefixes to each capture. Otherwise `url` is `http://127.0.0.1:8099`, which opens only on the server, and `shot` says so on the error output.

**A capture deletes itself alone.** `shots.clean` without a parameter does the gallery cleanup — what has exceeded its retention goes away — and answers `{ removed }`, the number of captures gone. `shots.clean { path }` deletes that one capture, and answers `{ removed: 1 }`. The `path` goes through the same door as `shots.read`: it is looked up in the `shots.list` listing, never resolved on disk. An absolute path, a `..`, an entry the gallery does not name — or no longer names, because it has just been deleted — return `bad_request` with the remedy that says to take a `path` from the listing again.

## Files

The seven `fs.*` commands open the customer's working tree: list a folder, describe an entry, read a file, write one, create a folder, move an entry, delete one.

**A single root, and nothing above it.** Every path is relative to the server's working folder — the home of the projects account — and this root does not appear in the contract, exactly as the projects root does not appear in it: it is a detail of the server, and the app therefore has nothing to concatenate. The empty string names the root itself, and is the only path `fs.list` accepts empty. An absolute path, a `..`, a symbolic link whose target leaves the root return `bad_request` with the remedy that says how to name a path. The agent does not judge these paths by hand: it opens the root once and acts only through it, so a link planted in the tree cannot become a read of `/etc/shadow`. A link that stays inside, for its part, is an entry like any other: `kind` says `link`, and its size and date are those of what it designates. A named pipe, a socket or a device is `special`: listed and described, never read nor hashed — a read there would wait forever —, and the app offers only renaming and deletion on it. An app that predates this kind reads it as a file and the read is refused with `bad_request`.

**Everything belongs to the projects account.** `pupitred serve` runs as root and drops privileges command by command; a file or folder created by these commands therefore belongs to that account, never to root, and a rewritten file keeps the owner and mode it had. A tree where root had sown files would be a tree the customer can no longer modify from their own terminal.

**What crosses the channel, and what will not.** `fs.read` returns the bytes on `file` events, cut into chunks of 48 KiB and cut on a multiple of three, like `shots.read`: each `bytes` decodes on its own, their concatenation decodes too, and the response's `sha256` says without ambiguity whether the file is whole. The read is capped at 1 MiB for text and 16 MiB for an image, and the refusal falls **before** the read, on the size the file system announces. The type is guessed by the extension then by the content: a file without an extension whose bytes are valid UTF-8 is text. Everything else — a PDF, an archive, a binary — is refused with `bad_request` with a `fix` that says to download it. This is deliberate: the channel serves to show what one reads and to modify what one writes, not to carry files. A real transfer would require a throughput, a resume and a progress that a sequence of JSON lines over an SSH session will never render well; it is not part of the protocol (see below), and `fs.stat { hash: true }` exists for that — it is the fingerprint a transfer compares on arrival, and it is returned even for a type the read refuses.

**Why a write carries a fingerprint.** `fs.write` takes the content in base64 — text is not the only case, and a JSON line does not carry a null byte — and `sha256`, the fingerprint of the version the reader read. If the file has changed since, the write is refused with a `fix` that says to read again: on this server, an agent can write to the same file between the read and the write, and a blind write would erase what it has just done. A write **without** `sha256` creates a file that did not exist, and nothing else: if the file is there, it is refused. The write is atomic — the file is written alongside then renamed — and capped at 1 MiB.

**The other refusals say what to do.** A missing folder is an error and not an empty list: unlike `completions`, which must not make a keystroke fail, the reader asked for that very folder. A listing stops at 2000 entries and sets `truncated: true`. `fs.mkdir` is idempotent — a folder already there is not an error — and refuses when a file bears that name. `fs.rename` refuses to overwrite an existing entry, and returns `path`, the entry's new place. `fs.remove` refuses a folder that is not empty until `recursive` is requested, and the refusal says how many entries it contains; `removed` counts what has gone, the folder itself included.

## What an update's signature covers

The signature is **Ed25519, base64-encoded**. It covers this exact message, ending with a line break:

```
pupitred\n<version>\n<architecture>\n<SHA-256 fingerprint in lowercase hexadecimal>\n
```

The fingerprint is that of the downloaded binary, computed by the agent itself over the bytes it has just received. Binding the fingerprint to the version and the architecture this way also refuses a binary authentically signed by us but published for another version or another machine.

The matching public key is **embedded in the binary at link time**. An agent built without a key refuses any update: this is the safe default, and it is intended. Nothing is written to disk before the verification succeeds.

**The fingerprint and the signature come from the platform, not from the app.** The agent reads `GET /api/v1/agent/release/:version/metadata` with its server token; it takes from it the expected fingerprint and the signature, refuses a binary whose fingerprint differs from the announced one, then verifies the signature. `signature` remains in the parameters as a fallback, for an agent whose platform is unreachable or too old to serve this route: when the platform answers, it is the platform that prevails and the parameter is ignored. An update without a `signature` parameter is therefore the normal case.

This format is the common reference of the release chain, the agent and the app. Changing it breaks all three at once.

## A key only enters on an approval

The platform transmits the devices' public keys; it can no longer open a server ([decision 0014](../decisions/0014-keys-approved-by-a-device.md)). The agent keeps a list of **signers** in `/etc/pupitre/signers.json`, root, 0600, and writes into the tagged block of `authorized_keys` only a signer key, or a key that arrives with an approval signed by a signer.

**Who becomes a signer.** A key set by `keys.trust` on the app's SSH session, a key accepted by a valid approval, the key of `sudo pupitred keys reset`, and, once only, the keys the block held when migration 6 (`key-signers`) ran: a server already in service keeps its devices without anyone having to approve them again.

**What `/agent/state` carries.** `keys[]`, one entry per key the platform wants on this server: `{ public_key, user_id, device_id, approvals[] }`. `authorized_keys`, the earlier bare list, remains served to older agents; an agent of this version ignores it. A response without `keys` leaves the block and the signers as they are.

**An approval** is `{ server_id, public_key, user_id, issued_at, signer, signature }` (`KeyApproval` in `packages/shared/src/keys`). `signature` is an armoured SSHSIG signature, made by `ssh-keygen -Y sign -n pupitre-key-approval` with a device's private key, which never leaves its computer, over these exact bytes, five lines each ended by a single `\n`, ASCII:

```
pupitre-key-approval-v1
server_id:<server_id>
public_key:<type> <base64>
user_id:<user_id>
issued_at:<YYYY-MM-DDTHH:MM:SSZ>
```

Nothing is trimmed or reordered on either side. The key is `type base64` without a comment; the date is UTC, to the second. Both sides are held to the same test set, made by a real `ssh-keygen` (`packages/shared/src/keys/fixtures.json`, exported as `key-approval.fixtures.json` for the agent).

**What the agent verifies** before accepting a key: the fields hold their patterns; `server_id` is the identifier this server has already noted, never the one the current response announces; `public_key` and `user_id` are those of the entry; the key is Ed25519 or ECDSA NIST, without option, without control character; `issued_at` is less than seven days old and no more than five minutes ahead; `signer` is the fingerprint of a signer and the key carried by the envelope is its own; the namespace is `pupitre-key-approval`, the hash `sha512` or `sha256`; the signature verifies; and the date is later than the last removal of this key, so that a replayed approval does not bring back a device that was removed. Otherwise the entry is ignored and counted **pending**. An accepted key becomes a signer in turn.

**Removing asks for nothing.** A signer the platform no longer asks for leaves the block and the list, and its removal is noted. But the agent **never removes the last key**: when nothing would remain, the block and the signers stay as they are. A revocation of the server token suspends the licence and no longer touches the keys, for the same reason.

**The heartbeat** carries `keys: { signers[], pending[] }`, fingerprints only — the platform already has the public keys. A change in the pending set makes the daemon beat right away, so that the app of a signer device offers the approval without waiting five minutes.

**The rescue** is on the machine: from the host's console, `sudo pupitred keys reset --key <public key or .pub file>` replaces the block and the signers with that key alone. The app's onboarding then takes it up, and puts its own device key back through `keys.trust`.

## The version floor

A signature never expires: yesterday's vulnerable binary stays signed tomorrow. Without a safeguard, whoever holds the channel could therefore reinstall an old, known-faulty version. The agent refuses to go down.

**The floor is the higher of two versions**: the one the agent is running at the time of the request, and `minimum_version` that `/api/v1/agent/state` announces for this server. A version strictly below the floor is refused with `downgrade_refused`, before any download.

The current version is the floor that counts, because the agent knows it without asking anything: it holds when the platform is unreachable, that is precisely when a hostile channel has the most latitude. `minimum_version` is the platform's memory — the last version it saw running on this server — and serves the case where the binary was replaced without the agent's agreement: whoever restarts on 0.9.0 is reminded that it was known on 1.4.0. When the platform does not answer, the floor is reduced to the current version, and the update forward remains possible: a stale agent must stay repairable.

`allow_downgrade: true` lifts the floor, and nothing else: the signature, the fingerprint, the version and the architecture are verified as always. It is an explicit gesture of the owner, which the app does not compose on its own; the refusal that precedes it carries the `fix` that names it. The limited session refuses it with `privilege_required`: a binary that is signed but known to be faulty, chosen by whoever holds `dev`, would be root code of their choosing.

## Versioning

`protocol` is an integer. A field added to a result does not increment it; a field removed or renamed does. It says nothing about the shape of the files put on the machine, which has its own counter — see [configuration migrations](./config-migrations.md). A `hello` whose `protocol` is not the agent's is refused with `protocol_mismatch`.

**Parameters are closed, results are open.** The agent refuses with `bad_request` a `params` key its schema does not know, so a field added to a command is readable only by the agents that know it, whereas a field added to a result is ignored by the apps that do not know it. A new parameter field is therefore always optional, and **the app omits it as long as it equals its default**: `defer` absent rather than `[]`, `boot` absent rather than `false`, `runtimes` absent rather than `{}`. This is what lets an app of one generation speak to all the agents of that generation without the compatibility sheet moving; a field that cannot be omitted at its default is a new generation.

The **compatibility sheet** says which of the two to update. It lives in `packages/shared/src/compat`, one row per generation — the protocol, the first app version and the first agent version of the generation — and travels to the agent in `schema.json`. A generation starts where one can no longer drive the other: a new protocol, or a gesture that changes path on the same protocol — 1.0, whose agent keeps the privileged commands for the [privileged session](#two-sessions-passwordless-and-privileged) that a 0.x app does not open. 2.0 opens protocol 3 (`{ protocol: 3, app: "2.0.0", agent: "2.0.0" }`): `entitlement` becomes `license` in `hello`, `snapshot` and the result of `enroll`, and `entitlement_required` becomes `license_required`. A pre-release belongs to the line it announces: `0.2.0-beta.1` is of the `0.2.0` generation.

The refusal of `hello` is written with it: an agent of an earlier generation answers that it is the one to update, and names the minimum version; an app of an earlier generation is told the opposite, through `protocol_mismatch`, even when it speaks the same protocol. A version that is not semver — a development build — is judged by no one, and the message falls back on the two protocol numbers.

`agent.upgrade` verifies the new binary with a `hello` where `app_version` is the installed version: a successor whose app floor exceeds the current version is not mistaken for a failure. Agents earlier than 1.0 send their own version, which the 1.0 agent refuses: they roll back, with this refusal as the message.

On the app side, the update banner reads the same sheet: for an agent one generation behind, `agent.upgrade` would fail — it no longer answers the protocol, or its successor would refuse its verification —, and the screen points to reinstalling the agent, which pushes the binary then launches `agent.migrate`.

## Outdated configuration

A configuration the binary does not read is not a configuration to guess at: a module handed values it understands wrongly rewrites them wrongly. As long as `hello` returns a `config.state` other than `current`, every command that reads or writes a configuration is refused with `migration_required`, with the `fix` that names the gesture.

Eleven commands remain open — `hello`, `ping`, `snapshot`, `status`, `report`, `diag`, `doctor`, `agent.upgrade`, `agent.migrate`, `enroll`, `platform.sync` — exported from `packages/shared` as `MIGRATION_COMMANDS`. A server that cannot be looked at is a server that cannot be repaired. The detail is in [configuration migrations](./config-migrations.md).

## Restricted mode

There are two situations, and they do not open the same commands. They add up with the refusal above: a restricted server whose configuration is overdue answers only to the intersection of the two lists.

**An enrolled server that has lost the platform.** Without a valid licence for seven days, `hello` returns `license: "restricted"` and nine commands answer: `hello`, `ping`, `snapshot`, `status`, `diag`, `agent.upgrade`, `agent.migrate`, `enroll` and `platform.sync`. The customer thus keeps the view of their machine, the means to ask the platform again for what it has not confirmed, the means to repair a stale agent and to bring its configuration to the shape this new agent reads, and the means to repair the server itself: a lost token, a revoked token or a licence to restore are settled by a re-enrolment from the app, without a detour through the console. Safety does not move — an enrolment token is signed by the platform for an authenticated account and an organization whose licence is valid, so admitting `enroll` opens nothing a valid account could not already obtain. The other commands return `license_required` with the link to the console and the reminder: free up to three servers per organization, a licence beyond that. The cache of the last response lives in `/var/lib/pupitre/license.json` (`entitlement.json` before 2.0.0, carried by migration 8). Nothing that is running stops: tmux, the projects and the services continue. Nothing that is running stops: tmux, the projects and the services continue.

**A binary without a server token**, copied to another machine, opens only `hello`, `ping`, `diag` and `enroll`. It has no server to describe and nothing to update: no token, so no functions. `enroll` is the door through which it obtains one, and it opens only on an enrolment token that the platform has signed for this device and this account. These four commands are exported from `packages/shared` as `UNENROLLED_COMMANDS`, the only list the app and the agent read.

## Transferring a large file is not part of the protocol

A multi-GB dump, a media folder, an archive: none of this goes through the agent's channel, capped at a line of a few MiB in base64 and entirely in memory. The app launches a separate `rsync` — `rsync -e "ssh -F <app config>" --partial --append-verify --info=progress2 --no-inc-recursive` — on its own SSH configuration, hence on the master session already open: no second authentication, a resume where the disconnection happened, and a progress read from `rsync`'s output. When `rsync` is missing on one side, `scp -F <config>` carries the file in one block and the app compares size and `sha256` through `fs.stat { hash: true }` on arrival. The remote path is relative to the root that `completions` names, as for `fs.*`, and validated by the main process; the local path always comes from a dialog box or a file drop, never from a renderer string. The agent takes no part in it, and that is deliberate: a transfer asks nothing of the server that an SSH session does not already do.

## A port's local tunnel is not part of the protocol

`tunnel.*` addresses the installed exposure, whichever it is — Cloudflare or Caddy — and its report names it in `provider`, `null` when none holds the machine. Bringing a server port to the laptop is something else, and it remains the app's business: it opens an `ssh -L` on its own channel, with its SSH configuration and its key. The agent takes no part in it, and that is deliberate — a local tunnel asks nothing of the server that an SSH session does not already do, and giving it a protocol command would amount to having the server decide on a listener on the customer's machine.
