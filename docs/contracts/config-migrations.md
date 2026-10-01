# Configuration migrations

An update reinstalls nothing. The agent binary is replaced, the app updates itself, and the files both of them read stay where they are. When a version changes the **shape** of one of those files — a renamed field, a module split in two, a value that no longer means what it used to — the new code reads the old shape and gets it wrong. This document says how that gap is closed, on both sides, and what it costs to add a shape change.

**The rule, in one sentence: a binary never reads a configuration it has not migrated.**

## What the registry owns

| Side | Files | Registry | Backups |
| --- | --- | --- | --- |
| Agent, on the VPS | `/etc/pupitre/install.json`, `/etc/pupitre/env`, `/etc/pupitre/projects.local.json`, any other file of `/etc/pupitre` that a migration names, and the licence cache `/var/lib/pupitre/license.json` (`PUPITRE_LICENSE_PATH`) with its predecessor `entitlement.json` | `/etc/pupitre/migrations.json` | `/var/lib/pupitre/config-backups/<timestamp>-r<revision>/`, the last five batches |
| App, on the laptop | `servers.json`, `account.json`, `transfers.json`, `forwards.json`, `preferences.json`, `connections/<provider>.json`, `access/<server>.json` in the data folder | the `version` field of the file itself | `<file>.r<revision>`, beside it; `<file>.corrupt` for a file that cannot be read |

What the registry does **not** own:

- **Files a module writes** — Caddy's configuration, a systemd unit, a service file. They belong to the module, and its `Upgrade` brings them to today's shape. The registry stays out of it: a module rewrites its own from its values at each version bump, whereas the registry carries the values.
- **`dev`'s sudo rule** (`/etc/sudoers.d/90-dev`, [decision 0015](../decisions/0015-sudo-by-password.md)). It belongs to `core.system`, which installs the old one on a new server and never rewrites the new one; and no migration goes from one to the other, because the new one requires a password that only the customer can accept. It is `harden.sudo`, called by the app, that installs it. See [the sudo password](./agent-protocol.md#the-sudo-password).
- **The platform database.** D1 has its SQL migrations (`packages/db/migrations`), which have nothing to do with these and never cross them.
- **The customer's code.** Projects, repositories, the data of installed databases are not Pupitre configuration.

## The revision is a counter, not a version

An integer that only goes up, held by the agent, independent of `X.Y.Z`.

Shapes do not change once per release, and a pre-release or a development build has no place in an order that must be exact. Comparing version numbers to decide whether a migration is due means giving yourself `0.4.0-beta.2` to rule on during an outage. A counter is not up for debate.

The agent version is **written beside** each registry entry, for whoever rereads a machine in two years. Nothing depends on it.

## What the machine says

`hello` carries an optional `config` field:

```jsonc
{ "id": 1, "ok": true, "result": {
  "agent_version": "2.0.0",
  "protocol": 3,
  "license": "valid",
  "capabilities": ["…"],
  "config": { "revision": 3, "expected": 4, "state": "pending" }
} }
```

| `state` | What it is |
| --- | --- |
| `current` | the configuration is the shape this binary reads |
| `pending` | it is behind: the migrations have not run yet, because an installation held the lock |
| `failed` | a migration refused; the configuration was **put back as it was** and nothing was left half changed |
| `ahead` | it is ahead: this machine was configured by a newer agent than the one running |

An agent that predates the registry does not return the field, and the app treats its configuration as current — which it is, since nothing had yet changed shape.

## `agent.migrate`

| Command | Parameters | Result |
| --- | --- | --- |
| `agent.migrate` | — | `{ revision, expected, state, applied[], pending[], backup?, failure?, restored }` |

- `applied[]` is what **this call** did: `{ id, slug, ms }`, in order. Empty when the agent had already migrated on its own at startup, which is the normal case.
- `pending[]` are the identifiers still due, when the state is not `current`.
- `backup` names the folder that keeps the files from before the batch. It is named even on success: that is where to go to roll back.
- `failure` names the migration that refused, and `restored` says whether the earlier files could be put back.

**`agent.migrate` always answers, even when a migration refused.** What refused, what was kept and what remains due are exactly what the reader needs; an error envelope would carry none of it. The refusal, for its part, belongs to every other command.

The command is open in [restricted mode](./agent-protocol.md#restricted-mode): `agent.upgrade` is too, and a server whose licence is pending is exactly the one we will want to update again.

## What a lagging server leaves open

A configuration the binary does not read is not one to guess at: a module handed values it misreads rewrites them wrongly. Every command that reads or writes a configuration is therefore refused with **`migration_required`**, with the `fix` that names the gesture.

What stays open is the view of the machine and the exit doors: `hello`, `ping`, `snapshot`, `status`, `report`, `diag`, `doctor`, `agent.upgrade`, `agent.migrate`, `enroll`, `platform.sync`. The list lives in `packages/shared` under `MIGRATION_COMMANDS`, travels in `schema.json`, and the agent reads it from there — like `RESTRICTED_COMMANDS`, and for the same reason: a server that cannot be looked at is a server that cannot be repaired.

## The order of an update

The app updates the agent, so it is the one that chains the steps. `runAgentUpgrade` does, in this order:

1. **`agent.upgrade`** — the binary is verified, replaced, the unit restarted. One update at a time (`busy` otherwise), and never during an installation, a backup or a restore: the restart would cut it. If the new binary does not answer `hello`, the old one comes back, and with it the configuration: the batch the new binary saved before migrating is put back, revision included, before the old one restarts — otherwise it would find an `ahead` configuration and refuse almost everything. It is the only restore the agent does by itself: that batch is a few seconds old, nothing has been configured since.
2. **The channel is closed.** The `pupitred serve` that answers us still holds the file it opened: the replacement is done by a `rename`, so only a new session reaches the version just installed. Without this closing, everything that follows queries the old binary.
3. **`agent.migrate`** — on the reopened channel. The new binary has already migrated while starting; the call confirms and reports. `unknown_command` is an agent that predates the registry: there was nothing to carry.
4. **`upgrade { modules }`** — the modules already installed replay their steps. If the migration failed, the agent refuses this command itself: the app has no guard to write, it has a sentence to display.

The agent **also migrates on its own**, at the start of `serve` and `daemon`, before serving the first command. That is what makes a machine updated by another path — a binary pushed by hand, an update coming from the platform — converge without anyone asking it anything. The fast path takes no lock: a machine already at the revision answers on a read of a small file, which is what each second channel opened during an installation does.

## What a migration must be

Five rules. They are not negotiable; the rest is taste.

1. **Idempotent.** Replayed on an already migrated machine, it changes nothing. That is what makes a recovery after a cut safe.
2. **No effect on an absent file.** A machine that never held this file has nothing to carry, and the migration leaves it alone.
3. **It reads raw JSON, never today's type.** `ctx.JSON()` returns a `map[string]any`, `ctx.Lines()` lines. Decoding into the Go struct of the moment would drop, along the way, any field that struct no longer names — which is precisely what the migration exists to carry.
4. **Its identifier is fixed forever.** It is what the machine remembers. A number that moves is a migration that runs twice or not at all. None is deleted, none is reordered: they are added.
5. **It touches only what it declares.** `Touches` is what is saved before the batch, hence what can be put back. A file written without being declared does not come back.

## The batch is a transaction

Before the first pending migration, the agent copies every file declared by the batch **and the registry itself** into a backup folder.

The registry is rewritten **after each migration**, not after the batch: a machine that loses power in the middle comes back consistent with itself and replays only what it must. A refusal, for its part, puts the whole batch back — the files and the registry, which are in the same backup — because half a batch is a shape that no binary was ever written to read.

An absent registry is revision zero: a machine configured before it existed owes every migration, and they are idempotent. A present registry that cannot be read is refused with `migration_required`, the state becomes `failed`, and nothing is replayed: it may come from a newer agent, whose shapes a replay from zero would take for the oldest. The `fix` says to put it back with `--restore`, or to delete it to replay everything. Likewise, a file that the batch backup could not read — anything other than an absence — stops the batch before the first migration: noted as absent, a restore would delete it.

## Going back

A machine that must run again an agent older than the one that configured it is `ahead`: the agent refuses to touch a configuration it does not read, rather than guess at it. Two exits, both explicit:

```bash
sudo pupitred migrate --status
```

```bash
sudo pupitred migrate --restore=20260911T100000Z-r3
```

`--restore` puts the batch's files back and **leaves the registry at the revision that corresponds to them**, so that a recent agent would replay what that batch had done. It is an owner's gesture, not a decision of the app: whatever was configured since goes with it. That is why the restore is not in the protocol — the app could not show what would be lost, and the customer has a terminal on that server anyway, in the app.

## Adding a migration

Agent side — `apps/agent/internal/migrate/migrations.go`:

```go
func All() []Migration {
	return []Migration{
		{
			ID:      1,
			Slug:    "rename-timezone",
			Since:   "0.5.0",
			Touches: []Target{TargetInstall},
			Apply:   renameTimezone,
		},
	}
}
```

App side — `apps/desktop/src/main/servers-migrations.ts`, `account-migrations.ts`, `transfers-migrations.ts`, `forwards-migrations.ts`, `preferences-migrations.ts`, `connections-migrations.ts` or `access-migrations.ts`, read and written by `versionedFile()` of `store-migrations.ts` (written beside then renamed, a file of a newer version never rewritten):

```ts
export const SERVERS_MIGRATIONS: readonly StoreMigration[] = [
  { apply: keptTheirOwnPort, id: 4, slug: "port-per-server" },
];
```

One test per migration: the earlier shape as input, the later shape as output, and the proof that a second pass changes nothing. The [`config-migrations` skill](../../.claude/skills/config-migrations/SKILL.md) gives the complete procedure.

## What stays true when nothing changes

A new machine is **stamped at the current revision without anything running** — there is no yesterday's shape to carry, and the registry says so to whoever reads it later.

## The app's connections registry

`connections-migrations.ts`, for `connections/<provider>.json`.

| No. | Slug | What changes |
| --- | --- | --- |
| 1 | `account-id-name` | Cloudflare named its account `accountId` and `accountName` before there was a second connection; every connection names it `id` and `name`. Both keys are renamed when present, without overwriting an `id` or a `name` already there; a record without an account is not touched. The code now reads only `id` and `name`. |

## The agent's registry

| No. | Slug | What changes |
| --- | --- | --- |
| 1 | `projects-local-json` | `/etc/pupitre/projects.local.conf`, the local project registry in `\|`-separated columns, becomes `/etc/pupitre/projects.local.json`. Each line of eight, nine or ten columns becomes a project; its subdomain becomes the `hostname` of its single route, composed with the machine's `PUPITRE_DOMAIN` — without a domain, the route keeps its port and the subdomain is written to the journal. The old file is saved with the batch, then deleted. |
| 2 | `projects-processes` | A project held one command, one port and one folder; it is now a repository, and holds `processes[]`, each with its own. Each entry of `projects.local.json` becomes a one-process project, whose `id` is the name folded into a DNS label and whose folder is `.`. Entries that shared the first segment of their `dir` shared a repository — that is what the old format meant, with `-` for the repository of every line but the first — and become **one** project whose `dir` is that segment, named after it when no line of another repository holds that name, one process per line in its subfolder. In `/etc/pupitre/env`, each `name:port` entry of `PUPITRE_DEBUG_PORTS` becomes `project/process:port`, the tmux window the process occupies. |
| 3 | `projects-boot` | Each line of `projects.local.json` carries `boot`, true when the project starts with the server; earlier lines did not ask for it and receive `false`. A line that already answers is left as is. |
| 4 | `runtime-versions` | A runtime asked for one version, `node_version: "22"` in `install.json`; it asks for several, `node_versions: ["22"]`. For `node`, `java`, `python`, `go`, `php`, `ruby` and `rust`, the value of `<tool>_version` becomes the one-element list `<tool>_versions`, unless the list is already there; the old key goes in every case. A module absent from `install.json` is not touched. |
| 5 | `projects-runtimes` | Each line of `projects.local.json` carries `runtimes`, the version pinned per tool; earlier lines name none and receive `{}`. A line that already answers is left as is. |
| 6 | `key-signers` | Keys approved by a device ([decision 0014](../decisions/0014-keys-approved-by-a-device.md)): the agent only installs a key if it is already a signer or a signed approval admits it. Each key of the managed block of `/home/dev/.ssh/authorized_keys` that can sign — ed25519 or ecdsa on a NIST curve, without options — becomes a signer in `/etc/pupitre/signers.json`, `via: "migration"`, so the update locks nobody out. An RSA key or one held by options is not carried over. A `signers.json` already there, a file that is absent, unreadable or linked outside `.ssh`, an empty block: nothing is written. |
| 7 | `projects-protected` | The access gate ([decision 0017](../decisions/0017-access-gate.md)): each line of `projects.local.json` that says nothing about `protected` receives `true`, so that a project published before the update no longer answers without a key. A line that already answers, `false` included, is left as is; a process receives nothing and follows its project. |
| 8 | `license-cache` | The `entitlement` → `license` rename ([decision 0018](../decisions/0018-source-available-and-free.md)), since 2.0.0: the cache `/var/lib/pupitre/entitlement.json` becomes `/var/lib/pupitre/license.json`, copied as is rather than awaited from the platform, so that an offline server keeps its seven days of tolerance. A `license.json` already there is not overwritten; the old file goes in every case. Without an old file, nothing is done. Targets `TargetEntitlement` and `TargetLicense`. |
