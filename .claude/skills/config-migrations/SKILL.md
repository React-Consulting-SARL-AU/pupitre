---
name: config-migrations
description: "Carry a configuration from one version to the next without reinstalling — the agent's numbered registry in `apps/agent/internal/migrate/migrations.go` and the app files' registries in `apps/desktop/src/main/*-migrations.ts`, `Touches`, raw JSON rather than today's type, idempotence, backup and restoration, `agent.migrate`, `pupitred migrate`, `migration_required` refusal. Use whenever a field is renamed, a module is split, a default value is changed, or the shape of a file that the agent or the app rereads is touched."
---

# Configuration migrations

An update reinstalls nothing. The agent's binary is replaced, the app updates itself, and the files they read stay where they are. **A binary never reads a configuration it has not migrated** — that is the rule, and this skill says what it costs to keep it.

Reference contract: [`docs/contracts/config-migrations.md`](../../../docs/contracts/config-migrations.md). Read it before writing.

## When this skill applies

Whenever a change touches the **shape** of what is already written on a machine or a laptop:

- a manifest field renamed, removed, or whose type changes — the values are in `install.json`;
- a module identifier that moves, a module split in two, two modules merged;
- a default value that changes meaning (not that changes value: a default is applied on read, it is not migrated);
- a key of `/etc/pupitre/env` renamed;
- a field added, removed or moved in `projects.local.json`;
- a field of `servers.json`, `account.json`, `transfers.json`, `forwards.json` or `preferences.json` on the app side.

This skill does **not** apply to:

| Case | Where it is settled |
| --- | --- |
| A file a module writes (Caddy, systemd unit, a service's conf) | that module's `Upgrade`, which rewrites it from its values |
| The platform database schema | Prisma migrations, `bun run db:migrate` |
| A field **added** to a protocol result | nothing: the contract allows it, the app reads it as optional |
| A field removed or renamed **in the protocol** | the compatibility sheet (`packages/shared/src/compat`) and the `protocol` integer |

A change can call for both: renaming a field in the manifest **and** in the protocol. These are two distinct gestures, in two distinct registries.

## Governed files

| File | Role |
| --- | --- |
| `apps/agent/internal/migrate/migrations.go` | the agent's list of migrations, in order |
| `apps/agent/internal/migrate/migrate.go` | the engine: revision, lock, batch, restoration |
| `apps/agent/internal/migrate/paths.go` | the `Target`s and their resolution |
| `apps/agent/internal/migrate/migrate_test.go` | the engine's tests; one test per migration is added there |
| `apps/agent/internal/i18n/catalog_migrate.go` | all the migration's sentences, FR and EN |
| `apps/desktop/src/main/store-migrations.ts` | the engine on the app side |
| `apps/desktop/src/main/servers-migrations.ts`, `account-migrations.ts`, `transfers-migrations.ts`, `forwards-migrations.ts`, `preferences-migrations.ts`, `connections-migrations.ts`, `access-migrations.ts` | the lists, one file per store; a new store adds its own here |
| `packages/shared/src/agent-protocol/migrate.ts` | `ConfigRevision`, `AgentMigrateResult` |
| `docs/contracts/config-migrations.md` | the contract |

## The five rules

They are not negotiable.

1. **Idempotent.** Replayed on an already migrated machine, it changes nothing. This is what makes a resume after an interruption safe.
2. **No effect on an absent file.** `ctx.JSON` returns `present == false`: return `nil` and stop.
3. **Raw JSON, never today's type.** `map[string]any` on the Go side, `JsonObject` on the app side. Decoding into the current structure would drop on the way any field it no longer names — precisely what the migration exists to carry. A test checks it.
4. **The identifier is fixed forever.** It is what the machine remembers. None is removed, none is reordered, none is renumbered: they are added.
5. **It only touches what it declares.** `Touches` is what is backed up before the batch, hence what can be restored. A file written without being declared does not come back.

## Writing an agent migration

### 1. The number

The next one in `All()`. Never a gap, never a reused number. `Since` carries the agent version that publishes it — documentation only, nothing depends on it.

### 2. The file

```go
// apps/agent/internal/migrate/migrations.go
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

// The field was `tz` until 0.5.0, where core.system started calling it what the
// form calls it.
func renameTimezone(ctx *Context) error {
	document, present, err := ctx.JSON(TargetInstall)
	if err != nil || !present {
		return err
	}

	config, _ := document["config"].(map[string]any)
	values, _ := config["core.system"].(map[string]any)

	held, named := values["tz"]
	if !named {
		return nil
	}

	values["timezone"] = held
	delete(values, "tz")

	return ctx.SetJSON(TargetInstall, document)
}
```

The targets: `TargetInstall` (`install.json`), `TargetEnv` (`env`), `TargetProjects` (`projects.local.json`), `TargetProjectsConf` (`projects.local.conf`, the shape from before revision 1, which only migration 1 reads), `TargetLicense` (`/var/lib/pupitre/license.json`, the licence cache, under `PUPITRE_LICENSE_PATH`) and `TargetEntitlement` (`entitlement.json` next to it, its shape from before 2.0.0, which only migration 8 reads). An undeclared target resolves under `/etc/pupitre` by its name — useful for a marker, to be used only if the file truly belongs to the registry and not to a module.

The `Context` helpers: `JSON`/`SetJSON` for a document, `Lines`/`SetLines` for a file in lines, `Read`/`Write` for bytes, `Exists`, `Remove`, `Logf`.

### 3. The test

In `migrate_test.go`, three assertions at least:

```go
func TestRenameTimezoneCarriesTheValueOver(t *testing.T) {
	machine := newSys()
	machine.Files[installPath] = []byte(`{"config":{"core.system":{"tz":"UTC"}},"legacy":1}`)

	if _, err := runner(machine, All()...).Run(); err != nil {
		t.Fatalf("Run: %v", err)
	}

	// the value is carried over…
	// …the field that today's code no longer names is still there…
	// …and a second pass changes nothing.
}
```

The third point is not decorative: it is idempotence, and it is what breaks first when a migration is written with a single machine in mind.

### 4. The sentences

Every visible sentence goes through `internal/i18n/catalog_migrate.go`, FR and EN, neither empty. A migration normally has nothing to say: its error message, if there is one, must name the file and what was not in it.

## Writing an app migration

```ts
// apps/desktop/src/main/servers-migrations.ts
export const SERVERS_MIGRATIONS: readonly StoreMigration[] = [
  {
    apply: (document) => {
      const servers = Array.isArray(document.servers) ? document.servers : [];

      return {
        ...document,
        servers: servers.map((server) => ({ ...(server as JsonObject), port: 22 })),
      };
    },
    id: 4,
    slug: "port-per-server",
  },
];
```

Same rules. `migrate()` stamps the document at the expected revision, `keepCopy()` keeps the previous file under `<file>.r<revision>`, and a file written by a newer version of the app is **never** rewritten — replaying would not repair it and would deprive the reader of the version that does read it.

The test goes in `src/main/__tests__/store-migrations.test.ts`.

## What the engine does around it

To know, so as not to redo it by hand:

- **The agent migrates by itself** at the start of `serve` and `daemon`, before serving the first command. The fast path takes no lock.
- **The batch is a transaction**: backup of the targets and the registry before, full restoration if a migration refuses.
- **The registry is written after each migration**, not after the batch: a power cut leaves a machine consistent with itself.
- **A machine never configured is stamped at the current revision** without anything running.
- **A lagging server refuses** everything that reads or writes a configuration, with `migration_required`, and leaves the machine's view and the exits open (`MIGRATION_COMMANDS`).

## The order of an update, app side

`runAgentUpgrade` does, in this order: `agent.upgrade` → **channel closing** (the `serve` that answers still holds the old binary, replaced by a `rename`) → `agent.migrate` → `upgrade` on the modules. Do not reorder, do not remove the closing.

## Verifying

```bash
bun run contracts:export
```

```bash
cd apps/agent && go test ./internal/migrate/ ./internal/protocol/ ./cmd/... && bun run lint
```

```bash
bun --cwd=apps/desktop run test && bun --cwd=apps/desktop run build
```

On the fake VPS (`apps/agent/test/vps`) or on the staging VPS, the verification that counts:

```bash
sudo pupitred migrate --status
```

It must say the revision, what has been applied, what is still due and the backups kept, and exit 0 when the machine is up to date.

## What is not done

- Writing code that reads "both shapes". It is a deferred migration, and it never gets done.
- Renumbering, reordering or removing an existing entry.
- Decoding `install.json` into `modules.Request` inside a migration.
- Migrating from the app by writing files on the VPS: the agent carries its migrations, the app triggers them.
- Restoring a backup automatically, outside the contract's one exception: when `agent.upgrade` puts the old binary back because the new one does not answer `hello`, the batch that the new one had just backed up before migrating is put back, revision included — it is a few seconds old, nothing has been configured since. Any other restoration (`pupitred migrate --restore`) is the owner's gesture, and what has been configured since goes with it.
