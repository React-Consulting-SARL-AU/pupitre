# Service catalogue

The catalogue is a **library of the most widely used stacks**, chosen because they install and run cleanly. It is complete: thirty-eight modules, all shipped. It does not aim at exhaustiveness: what is not in it, the customer installs by hand on their machine, and Pupitre does not stand in the way. The probe reports what it finds, the modules only touch what they installed.

A service is a **module** of the agent: a Go unit that knows how to install itself, check itself, configure itself, upgrade itself, uninstall itself and report its state, on Ubuntu 22.04 and 24.04, amd64 and arm64. The app knows no service by name: it displays the manifests the agent declares.

## Manifest

Types in `packages/shared/src/catalog/`, exported as JSON Schema for Go.

```ts
type Manifest = {
  id: string                     // "db.postgres"
  category: "core" | "runtime" | "database" | "ai" | "editor" | "exposure" | "tool"
  name: string                   // "PostgreSQL 17"
  summary: string                // one sentence, for the card
  requires: string[]             // module ids
  conflicts: string[]            // module ids
  resources: { ram_mb: number; disk_mb: number }
  arch: ("amd64" | "arm64")[]
  fields: Field[]                // what the configuration screen asks for
  connection?: ConnectionKind    // the third-party account this module requires from the app: `CONNECTION_KINDS` of `packages/shared` — cloudflare, wrangler, github, 1password, neon, vercel, supabase, stripe, backup
  runs: boolean                  // the module holds a process, or launches one at any time
  mandatory: boolean             // true for core.system and core.hardening
  since: string                  // agent version
}

// Fields common to all kinds, in addition to `key`, `kind` and `label`:
//   help?      the short sentence under the control, the one that decides
//   hint?      { text, url? } — the long form, behind a bubble
//   format?    "port" | "hostname" | "domain" | "email" | "identifier" | "path" | "timezone" | "size" | "url"
//   pattern?   an expression, when no format fits
//   min_length? max_length?
//   managed?   derived from a connection by the app: never typed, never displayed
type Field =
  | { kind: "text" | "number" | "select"; required: boolean; default?: unknown; options?: string[]; min?: number; max?: number }  // min and max bound a number, a port for instance
  | { kind: "secret"; required: boolean; generate?: boolean }  // generate: offered generated, never displayed
  | { kind: "version"; options: string[]; default: string }
  | { kind: "versions"; options: string[]; default: string[] }  // several majors at once; options from newest to oldest, the newest ticked is the machine default
  | { kind: "boolean"; required: false; default: boolean }  // a checkbox, never required
  | { kind: "list"; required: boolean; items: "text" | "secret"; min?: number; max?: number }  // a list of values of the same kind
```

**`runs` says what has a state to watch.** A database, a tunnel, an editor server, a coding agent hold a process or launch one at any time; a language, a CLI and the hardening pass leave nothing behind. The dashboard shows only the former — the others live on the services screen, where they are configured and upgraded. A systemd unit is not the rule: hardening holds one and has nothing to show. A module that predates the field does not return it, and the app then treats it as a module that runs, which is what the dashboard did before the field existed.

## Connections

A **connection** is a third-party account the app holds for the customer, on their workstation, valid for all their servers. A **module** is a unit the agent installs on a server. A module that requires a connection declares it, and the configuration screen asks for it above its own questions rather than three screens later.

Nine connections exist: **Cloudflare**, **Wrangler**, **GitHub**, **1Password**, **Neon**, **Vercel**, **Supabase**, **Stripe** and **Backups** (`backup`, an S3 bucket). The app keeps each one's token in the system keychain, one file per connection, and only the ciphertext touches the disk. The `backup` connection additionally holds the backups' public key and its salt, which are not secrets; the passphrase they come from is kept nowhere ([backups.md](./backups.md#encryption)).

A Cloudflare token can open several accounts. The app acts on only one — its zones are the ones offered for a domain, its tunnel the one it creates, its identifier the one Wrangler deploys on — and that account is **chosen by the customer** at connection time when there are several, never the first one Cloudflare lists. `connections:connect` then answers `{ status: "choose", accounts }` and nothing is retained until the token is sent again with the chosen account; "Verify" then weighs the token against that account, and refuses a token that no longer opens it.

Cloudflare and Wrangler open the same account with two tokens, because they do not live in the same place: the first creates the tunnel and writes the DNS from the workstation and never reaches the server; the second is exported into the `dev` shell for Wrangler, where the customer's agents and projects run. A single token for both would leave the rights on the customer's domain where they are most exposed. Each carries only its own permissions: Tunnel and DNS for one, Workers and whatever the server deploys for the other.

| Connection | Verified on entry | What it fills |
| --- | --- | --- |
| `cloudflare` | `GET /accounts`: the account the token opens, and the zones it carries. A token without `Account Settings · Read` is accepted but lists no account: the refusal names this permission | the three `managed` fields of `exposure.cloudflare` — `account_tag`, `tunnel_id`, `tunnel_secret` |
| `wrangler` | `GET /accounts`: the account the token opens, same requirement | the two `managed` fields of `tool.wrangler` — `api_token`, `account_id` |
| `github` | `GET /user`: the account the token opens | the `managed` field `token` of `tool.github` |
| `1password` | nothing: a service account token answers no call from the workstation. It is retained without a name, and the server says at install time whether it opens a vault | the `managed` field `service_account_token` of `tool.1password` |
| `neon` | `GET /users/me`: the account the key opens | the `managed` field `api_key` of `tool.neon` |
| `backup` | the bucket, from the workstation ([backups.md](./backups.md#the-app)); the server probes it in turn at install time (`verify-bucket`) | the nine `managed` fields of `core.backup` — `endpoint`, `region`, `bucket`, `prefix`, `path_style`, `access_key_id`, `secret_access_key`, `recipient`, `kdf_salt` |

**Nothing changes on the wire** for a token moved from a form to a connection. It reaches the machine on the `install` secrets line, grouped by module id like the others, written by the app's main process, and is stored in `/etc/pupitre/env` readable by root alone. A token that a CLI reads itself from its environment (`NEON_API_KEY`, `OP_SERVICE_ACCOUNT_TOKEN`, `CLOUDFLARE_API_TOKEN`) is also exported into `/home/dev/.config/pupitre/env`, 0600 under `dev`, which `~/.zshenv` reads: without it, `neon me`, `op whoami` or `wrangler whoami` in a terminal would see no account. What changes is where the app holds it: an account connected once, instead of a field retyped for each server. A module whose account is not connected is refused **before the first step**, with the `connection` problem.

- **A `managed` field is derived from a connection by the app, never by the platform.** The agent refuses to register a manifest that carries one without declaring a connection. A `managed` field of kind `secret` receives the connection's token; a `managed` field of kind `text` receives the identifier of the account that token opens — `account_id` of `tool.wrangler`, like `account_tag` of `exposure.cloudflare`, which the tunnel derives itself.
- **The tunnel belongs to the server.** The app creates it once on the customer's account, pushes its identifier and secret, then keeps nothing: `module.config` hands it back when needed. A reinstalled workstation, or a server entrusted to a colleague, finds the tunnel again with just the account's token.
- **The domain is an ordinary field**, required, of format `domain`, chosen per server. The zone is deduced from the domain; the screen offers the account's zones to prefill it.

## Validation

The constraints live in the manifest, and both sides apply them with the same code. `packages/shared/src/catalog/validate.ts` and `apps/agent/internal/contract/fields.go` are checked against a single set of cases, `validate.fixtures.json`, exported to the agent by `contracts:export`.

A value outside its constraint is **refused**, never replaced by the default. An absent field takes the manifest default, exactly as the module will read it.

```ts
type FieldProblem = {
  module: string
  field: string        // empty when the problem is the module's: a missing connection
  code: "required" | "type" | "min" | "max" | "min_length" | "max_length"
      | "options" | "format" | "pattern" | "connection"
  expected?: string    // the bounds, the list of options, the name of the format
  message?: string     // filled by the agent, in the session's language
}
```

`install` validates everything **before its first step**: a refusal is `invalid_config`, with the complete list in its `invalid_fields` remedy, and nothing is touched on the machine. A module therefore no longer checks its own fields.

A secret — a `secret` field, or each element of a list of secrets — carries no carriage return, no line feed, no null byte: it is written into a configuration line (`requirepass`, `/etc/pupitre/env`, a SQL statement), which a line feed would end to start another. The refusal is `pattern`, with `SECRET_PATTERN` (`^[^\r\n\x00]*$`) as `expected`. The app applies it before sending (`validateField` of `@pupitre/shared/catalog/validate`), the agent on receipt (`fields.go`): the `secret/*` cases of `validate.fixtures.json` hold both sides. Spaces, quotes and tabs pass.

`install.check` replays this validation without installing anything, and adds what only the machine knows: a port already listened on, a folder that is a file, a time zone this kernel does not know. It never judges a secret — the app holds its vault and will write it at install time.

A `preset` carries an `id`, a displayable `name` and its list of modules: the app shows the name the agent gives, with no translation table. Its optional `choose_one` names exclusive modules between which the screen has the user choose before applying the preset.

## Steps

Each module implements `Check`, `Install`, `Configure`, `Upgrade`, `Uninstall`, `Status`. Each step is idempotent: it checks before acting, and the whole installation can be replayed without damage. A step emits `step` events with its duration; a step that fails does not stop the other modules, it is noted with its replay command.

## A CLI's account

A module whose CLI connects to an account also implements `Login`: it asks the CLI its own question — `gh auth status`, `claude auth status`, `codex login status`, `cursor-agent status`, `opencode auth list`, `neonctl me`, `op whoami`, `wrangler whoami`, `code tunnel user show` — and returns a `login` according to [agent-protocol.md](./agent-protocol.md#a-clis-account). The CLI is the only judge: the agent never reads a credentials file to guess. A CLI that takes its key from the environment is only queried with it — without a key, `neonctl` would open a browser login that nobody is watching, and wait — and a CLI that has nothing to open on this machine, the `editor.vscode` tunnel that was not requested, returns nothing.

| Module | Command | Report |
| --- | --- | --- |
| `ai.claude` | `claude auth status` | the email, otherwise the organization name |
| `ai.codex` | `codex login status` | the email from the identity token the ChatGPT login left; empty for an API key |
| `ai.cursor` | `cursor-agent status --format json` | the email Cursor returns; empty when it does not give it |
| `ai.gemini` | — | Gemini CLI has no command that answers without spending a request: nothing is returned |
| `ai.copilot` | — | same for the Copilot CLI |
| `ai.opencode` | `opencode auth list` | the providers that hold a key or a token, comma-separated; disconnected when there are none — OpenCode then runs on its free models |
| `tool.github` | `gh auth status --active --json hosts` | the login |
| `tool.1password` | `op whoami --format=json` | the email, otherwise the account address — a service account has none |
| `tool.neon` | `neonctl me -o json` | the email, otherwise the login |
| `tool.wrangler` | `wrangler whoami --json` | the email, otherwise the connection's account name |
| `tool.vercel` | `vercel whoami` | the user name the token opens |
| `tool.supabase` | `supabase orgs list -o json` | the organizations the token opens, comma-separated — the CLI does not name the person |
| `tool.stripe` | `stripe get /v1/account` | the name the dashboard displays, otherwise the account identifier |
| `exposure.tailscale` | `tailscale status --json` | the login that owns the node, otherwise its DNS name on the tailnet; disconnected when the node is on no tailnet |
| `editor.vscode` | `code tunnel user show`, when the tunnel is requested | the provider — `github`, `microsoft` — the CLI does not name the account |

## Modules

### Base

`core.system` and `core.hardening` are mandatory; `core.backup` is optional.

| Id | Does | Fields |
| --- | --- | --- |
| `core.system` | base packages — including `rsync`, which the app uses to transfer files with resume; a machine installed before it receives it at the next module upgrade — time zone, automatic security updates without reboot, sized swap, memory safeguard (`systemd-oomd` or `earlyoom`), `dev` user with sudo — passwordless until `harden.sudo` gives it a password and leaves only `pupitred` without one, a rule that neither `install` nor `upgrade` reopens afterwards —, whose `authorized_keys` receives root's unrestricted keys so a key opens it before hardening, tmux, zsh and bash with the prompt markers (OSC 133) read by the app, `dev` command linked to the binary, git identity | `timezone`, `git_name`, `git_email`, `projects_dir` |
| `core.hardening` | ufw on SSH only: every port where sshd listens, read by `sshd -T` (`port`, `listenaddress`) and, on a socket-activated sshd, by the `ssh.socket` listener, opened before the firewall is raised — an unreadable port leaves the firewall as is and the step fails —, plus 22 and 443 with `ssh_443`; fail2ban on the same ports, root closed and passwords disabled **after** verifying that a key opens `dev`, `AllowUsers dev`, `ClientAlive`. With `keep_root`, root keeps its place in `AllowUsers` and goes to `PermitRootLogin prohibit-password`: by key, never by password | `ssh_443` (boolean), `keep_root` (boolean) |
| `core.backup` | nothing on the machine apart from its values in `install.json`: the installation probes the bucket (`verify-bucket`), the daemon backs up when due, encrypted for the customer's public key; uninstalled, it schedules nothing and leaves the bucket as it is. Everything goes by default: the settings name what stays out, project by project and database by database, and `backup.contents` returns the list to tick. See [backups.md](./backups.md) | `endpoint` (text, HTTPS only, pattern `BACKUP_ENDPOINT_PATTERN`), `region`, `bucket` (S3 patterns), `prefix`, `path_style` (boolean), `access_key_id`, `secret_access_key` (secret), `recipient`, `kdf_salt` — all `managed` by the `backup` connection —; `interval_hours` (0–720), `hour` (0–23), `keep` (1–365), `databases`, `home`, `projects`, `projects_env_only` (boolean), `extra_paths` (list of text), `exclude_projects` (list of text, pattern `BACKUP_PROJECT_ITEM_PATTERN`), `exclude_databases` (list of text, pattern `BACKUP_DATABASE_ITEM_PATTERN`: `postgres:shop`, `redis:*`) |

### Runtimes

| Id | Does | Fields |
| --- | --- | --- |
| `runtime.node` | mise; Node at the ticked majors (24 by default, the active LTS), Bun, pnpm, Yarn; pnpm and Yarn through corepack; enabled in all shells including non-interactive ones by a marked block of `.zshenv` | `node_versions` (versions), `bun` (boolean), `pnpm` (boolean), `yarn` (boolean, unticked) |
| `runtime.java` | Temurin through mise at the ticked majors, `JAVA_HOME` resolved by mise when each shell opens — hence the project's when it pins one —, Gradle daemon sized for the RAM | `java_versions` (versions) |
| `runtime.python` | uv and Python at the ticked versions; base of the Python agents | `python_versions` (versions) |
| `runtime.go` | Go through mise at the ticked versions, `GOPATH` and its `bin` on the `PATH` | `go_versions` (versions), `gopath` |
| `runtime.php` | build dependencies, PHP compiled by mise at the ticked versions, Composer optional, a `php.ini` read after the build one | `php_versions` (versions), `composer` (boolean), `memory_limit` |
| `runtime.ruby` | build dependencies, Ruby compiled by mise at the ticked versions, Bundler refreshed under each interpreter just installed | `ruby_versions` (versions), `bundler` (boolean) |
| `runtime.docker` | Docker Engine and Compose from Docker's repository, `dev` in the `docker` group, container log rotation, `live-restore` so a daemon restart cuts no container, and a port published without an address bound to the loopback only: Docker's NAT rules come before ufw's, and `-p 5432:5432` would otherwise be open to the Internet, in IPv4 and in IPv6. `"ip": "127.0.0.1"` holds only the default bridge; `default-network-opts` sets `com.docker.network.bridge.host_binding_ipv4: 127.0.0.1` on every network that `docker network create` or Compose creates afterwards. A default IPv4 address publishes nothing on `[::]` — only `0.0.0.0` covers both families —, so no IPv6 setting needs adding. Publishing on purpose means naming the address (`-p 0.0.0.0:8080:80`), which ufw does not filter. A server from before receives the setting at its `upgrade`, which rewrites `daemon.json` and restarts the daemon. What this restart does not change, `check-published-ports` reads in the daemon and names: dockerd only rebuilds its default bridge when restarting with no container running — the step then restarts it itself —, a network keeps the options of its creation and a container its ports; the warning cites the containers published on all addresses without having asked for it and the networks left open, and the gestures that close them (stop the containers, `systemctl restart docker`, `docker compose down && docker compose up -d`, `docker network rm` then `create`). Swarm services ignore it | `compose` (boolean), `data_root`, `log_max_size` |
| `runtime.rust` | Rust through mise, which installs rustup and the ticked toolchains; `~/.cargo/bin` on the PATH of all shells | `rust_versions` (versions) |

### Databases

| Id | Does | Fields |
| --- | --- | --- |
| `db.mysql` | MySQL 8 or MariaDB, bound to `127.0.0.1` on the chosen port, root on socket, application account, remote account for the laptop through SSH, sized buffer pool, automatic import of the dumps dropped in `~/dumps/` | `engine: mysql \| mariadb`, `port`, `app_user`, `remote_user`, `app_password` (generated), `remote_password` (generated), `buffer_pool` |
| `db.postgres` | PostgreSQL at the chosen major version from the project's repository, local only, application and remote roles, sized shared memory, common extensions, dump import | `version`, `port`, `app_role`, `remote_role`, `app_password`, `remote_password`, `shared_buffers` |
| `db.mongodb` | MongoDB at the chosen major version, local only, application user, sized WiredTiger cache, `mongodump` import. A major that MongoDB does not publish for the server's Ubuntu version — 7.0 on noble — is refused by `install.check` on the field, and by `add-repository` before anything is written; the table of releases lives next to the manifest. Uninstalling removes all the packages the repository installed (`mongodb-org-*`, `mongodb-mongosh`, `mongodb-database-tools`), its list and its key | `version`, `port`, `app_user`, `app_password`, `cache_mb` |
| `db.redis` | local only, password required, persistence, memory ceiling and eviction policy of choice; a replay that changes everything except the port goes through `CONFIG SET` on the running server, without a restart — a cache without persistence keeps what it holds | `port`, `password`, `persistence` (boolean), `maxmemory_mb`, `maxmemory_policy` |
| `db.mailpit` | Mailpit, binary of the GitHub release verified by the digest GitHub publishes, as the `pupitre-mailpit` systemd service under `dev`: SMTP and interface on the loopback, messages in `~/.local/share/mailpit`; no `db.*` command, it is not an engine | `smtp_port`, `http_port` |

### AI agents

| Id | Does | Fields |
| --- | --- | --- |
| `ai.claude` | Claude Code, login through the URL displayed in the app's terminal, project context, Pupitre skills (capture, branch, PR, ship) | — |
| `ai.codex` | Codex, same | — |
| `ai.cursor` | Cursor CLI (`cursor-agent`), Cursor's archive under `~/.local/share/cursor-agent/versions`, `agent` and `cursor-agent` links in `~/.local/bin`, Pupitre skills in `~/.cursor/skills`; no machine context, Cursor has no global rules file | — |
| `ai.gemini` | Gemini CLI through mise, machine context in `~/.gemini/GEMINI.md`, Pupitre skills in `~/.gemini/skills` | — |
| `ai.copilot` | GitHub Copilot CLI through mise, machine context in `~/.copilot/copilot-instructions.md`, Pupitre skills in `~/.copilot/skills` | — |
| `ai.opencode` | OpenCode, binary of the GitHub release verified by the sum GitHub publishes, `~/.local/bin/opencode`, machine context in `~/.config/opencode/AGENTS.md`, Pupitre skills | — |
| `ai.hermes` | Hermes Agent (Nous Research) through Python, model provider configuration, systemd service if always on, restarted when a key changes | `providers` (list of secrets), `always_on` (boolean) |
| `ai.openclaw` | OpenClaw through mise on the Node of `runtime.node` (24.16 or later, checked before installation), model providers in `~/.openclaw/providers.env` under the names the gateway reads, `openclaw gateway` gateway as the `pupitre-openclaw` systemd service on 127.0.0.1:18789 if always on — restarted when a key changes —, Pupitre skills; channels are plugged in through `openclaw onboard` in a terminal | `providers` (list of secrets), `always_on` (boolean) |
| `ai.browser` | headless Chrome, Playwright dependencies, `shot` command that files images by project in the gallery (`~/shots/<project>/<day>/`, `~/shots/_unfiled/<day>/` outside a project), `pupitre-shots` gallery on 127.0.0.1:8099; with a subdomain, the gallery is published by the installed exposure under `https://<subdomain>.<domain>/<token>/`, the token drawn by the agent in `/etc/pupitre/shots.env` (0600, read by systemd) | `subdomain` (text, a DNS label, empty = local gallery) |

### Remote editors

| Id | Does | Fields |
| --- | --- | --- |
| `editor.jetbrains` | remote development backend preinstalled in the cache JetBrains Gateway expects, JVM and memory sized; the service returns its folder in `path` and the app opens through the Gateway link (`idePath`, `deploy=false`); customer's licence | `ide: idea \| webstorm \| pycharm \| phpstorm \| goland`, `version` |
| `editor.vscode` | `code` CLI and remote server preinstalled so the first Remote SSH connection is immediate, base extensions, Remote Tunnel optional; a replay keeps the registered server, only `upgrade` takes the next version; same mechanism for Cursor and Windsurf | `extensions` (list of text), `tunnel` (boolean) |
| `editor.zed` | Zed remote server preinstalled for the customer's version; on `latest`, a replay keeps the installed version and only `upgrade` takes the next; opened through `zed://ssh` | `version` |

Visual Studio has no Linux backend: the app says so and points to `editor.vscode`.

### Exposure

Caddy and the tunnel are exclusive: each declares the other in `conflicts`. Tailscale is an exposure too, but a private one — the customer's tailnet, nothing published — and coexists with either. Ticking neither Caddy nor the tunnel is the third state, and it carries no module: the machine answers through the SSH session the app already holds, and nothing is published. The `tunnel.status`, `tunnel.sync` and `tunnel.restart` commands address whichever is installed, never a named provider — `/etc/pupitre/exposure` says which one holds the machine, and the report names it in `provider`. A machine that nothing exposes answers `absent` with `provider: null`; `tunnel.sync` and `tunnel.restart` refuse there with `service_not_found` rather than answering for an absent module.

| Id | Does | Fields |
| --- | --- | --- |
| `exposure.cloudflare` | a tunnel, one route per project, managed DNS and certificate, subdomains from the registry, on the customer's Cloudflare account. **The app holds the token**: it creates the tunnel and writes the DNS from the laptop, the server receives only what it needs to run it, and keeps it | `domain`, chosen per server; three `managed` fields derived from the connection: `account_tag` (32 hexadecimal digits), `tunnel_id` (a UUID), held to that pattern because they are written as is into cloudflared's YAML, and `tunnel_secret` |
| `exposure.caddy` | reverse proxy with automatic Let's Encrypt certificates for a domain without Cloudflare, one route per project that declares a subdomain, its two ports opened in ufw in the form `<port>/tcp` with the comment `caddy`, read by `ufw show added` (the firewall may not be raised yet); a moved port closes the old rule in the same pass. A Caddyfile is only put in place after `caddy validate` on a copy beside it, and a Caddyfile found identical is revalidated: a refusal leaves in place the one Caddy is running | `domain`, `email`, `http_port`, `https_port` |
| `exposure.tailscale` | Tailscale from the vendor's repository, the node joined to the tailnet by `tailscale up --auth-key` (the key masked in the journal), `ufw allow in on tailscale0`; on an already joined node, `hostname` and `ssh` changes go through `tailscale set`, without a second key; `ssh` is disabled by default, because Tailscale SSH answers before sshd: neither `AllowUsers`, nor `PermitRootLogin`, nor fail2ban apply to it, only the tailnet's access policy; contradicts neither Caddy nor the tunnel, the "everything" preset includes it; uninstalling does `tailscale logout` before removing the package | `auth_key` (secret, typed: a key from the Tailscale console, not a connection), `hostname`, `ssh` (boolean) |

Uninstalling an exposure that does not hold the machine — the `/etc/pupitre/exposure` marker names another — leaves that marker and `PUPITRE_DOMAIN` to the one that holds it: removing a tunnel left over from a failed installation does not deprive Caddy of its domain, nor `project.add` of subdomains. A Caddyfile that `caddy validate` refuses on `tunnel.sync` answers `bad_request`, with the remedy, and not `internal`.

An apt repository added by a module, whose first `apt-get update` fails, is removed with its key before the step fails (`apt.RefreshAdded`): an unreadable list would make every following installation fail, whatever the module.

`core.hardening` governs the bare `22` and `443` rules — SSH — and never touches them otherwise; `exposure.caddy` writes its own as `<port>/tcp`. The two do not step on each other.

The `domain` of both modules is chosen among the connected account's zones when it is Cloudflare, and changed afterwards from the service screen: the first step of `Configure`, `move-routes`, then carries every registry name from the old domain to the new one before the domain is saved and the ingress or the Caddyfile rewritten ([agent-protocol.md](./agent-protocol.md#one-process-one-command-several-ports)). The DNS records follow from the app, which removes only those it wrote.

### Tools

| Id | Does | Fields |
| --- | --- | --- |
| `tool.github` | `gh`, HTTPS clone without a key, server key registered on the account; a rotated token reconnects `gh` | `token` (secret, `managed` by the `github` connection) |
| `tool.1password` | CLI and service account, `OP_SERVICE_ACCOUNT_TOKEN` exported in the `dev` shell, vaults checked only on each new token, generation of `.env.local` files from the repositories' templates | `service_account_token` (secret, `managed` by the `1password` connection) |
| `tool.neon` | the Neon CLI in `/usr/local/bin/neon`, `neonctl` linked to it (it is the name its help prints), and the key stored in `/etc/pupitre/env` then exported in the `dev` shell — `neonctl` has no token login, it takes it from `NEON_API_KEY`, and without it it launches a browser login; projects and databases remain the customer's decision | `api_key` (secret, `managed` by the `neon` connection) |
| `tool.vercel` | the Vercel CLI installed by mise (`npm:vercel`) on the Node of `runtime.node`; the token stored in `/etc/pupitre/env` then exported in the `dev` shell as `VERCEL_TOKEN`, which the CLI reads itself | `token` (secret, `managed` by the `vercel` connection) |
| `tool.supabase` | the Supabase CLI in `/usr/local/bin/supabase`, binary of the GitHub release verified by `checksums.txt`, version recorded under `/var/lib/pupitre/versions`; the token stored then exported as `SUPABASE_ACCESS_TOKEN` | `access_token` (secret, `managed` by the `supabase` connection) |
| `tool.stripe` | the Stripe CLI in `/usr/local/bin/stripe`, binary of the GitHub release verified by `stripe-linux-checksums.txt`; the key stored then exported as `STRIPE_API_KEY` — a restricted test key, never the production secret key | `api_key` (secret, `managed` by the `stripe` connection) |
| `tool.wrangler` | Wrangler, Cloudflare's CLI, installed by mise (`npm:wrangler`) on the Node of `runtime.node`; the token and the account identifier stored in `/etc/pupitre/env` then exported in the `dev` shell as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, which Wrangler reads itself — no `wrangler login`, and a token that opens several accounts deploys on the connection's one; Workers, D1 databases and Pages remain the customer's decision | `api_token` (secret, `managed` by the `wrangler` connection), `account_id` (text, `managed` by the same connection) |

## Presets

| Preset | Name | Modules |
| --- | --- | --- |
| `web-js` | Web JavaScript | `core.*`, `runtime.node`, `db.mysql`, `ai.claude`, `ai.browser`, `editor.vscode` — no exposure, which is the default state |
| `full` | Whole catalogue | the whole catalogue minus Caddy and the tunnel, which contradict each other: the preset carries both in `choose_one` and the screen asks which one; Tailscale, which contradicts nothing, is part of it |
| `minimal` | Minimal | `core.*`, one agent of choice |

A preset's module identifiers follow the same open form as a manifest's: a module the agent gains before `packages/shared` knows it can enter a preset without a version of that package.

## Source of the steps

The modules shipped under `apps/agent/internal/modules/` are the reference for what a module does: order of steps, apt options (`DPkg::Lock::Timeout`), closing root last, closing report. A new module is read against its nearest neighbour; the `agent-modules` skill says which.

### What the customer chooses

A module asks the customer for everything they might want to decide, and nothing more: the **version** when several can be installed — a runtime through mise, a database whose repository publishes several; the **port** when a service listens; the **names of the accounts** the module creates for it. Each field carries a `default` that is the default choice, so a customer who touches nothing gets the same machine as before.

An account name and a version cross a configuration file or a SQL query: the manifest holds them to a `format`, and a value that does not match is **refused before the first step**, with the field named. Nothing silently falls back to the default: a customer who types `my-app` would get `app` without ever learning it.

Redis is an exception for the version: the module installs Ubuntu's package, and does not add one more repository for a choice nobody asked for.

### A runtime holds several versions at once

A language is chosen as `versions`, not `version`: several projects on the same machine do not all run the same Java or the same Node. The field is a closed multi-checkbox list, `options` from newest to oldest, at least one ticked. The agent installs each ticked major (`install-<tool>-<major>`, through `mise install`), makes **the newest ticked the machine default** (`use-<tool>`, through `mise use -g`) — what a shell outside any project returns, and what a project that says nothing gets — and removes what is no longer ticked (`prune-<tool>`). `upgrade` brings each major to its latest patch and removes the one it replaces. The service returns `versions[]`, the majors the machine actually holds, from newest to oldest: that is where a project chooses. Shared tools — mise, `~/.config/mise/config.toml` — remain when a runtime leaves; the others use them.

A project's choice is the protocol's business (`runtimes` on `project.add` and `project.update`): the agent writes a `mise.local.toml` at the project root, which mise reads before anything the repository declares, for its processes as for the terminals opened inside it. What the customer types by hand in their own `mise.toml` or `.tool-versions` holds for projects that pin nothing, as long as the requested version is installed.

### The editors' `version` field stays free text

Remote editor modules expose `version` as `text`, with `latest` by default, and not the closed-list `version` kind. No list would hold: Zed's remote server must match exactly the version of the client installed on the laptop, and a JetBrains backend that of the Gateway. A list of options would be wrong the day the editor first updates, client side, without our knowing.
