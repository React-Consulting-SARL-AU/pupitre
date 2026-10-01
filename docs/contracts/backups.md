# Backups

A backup is what it takes to rebuild a Pupitre server elsewhere, or to put it back in yesterday's state: its configuration and secrets, its databases, its projects as they are, and the `dev` account's sessions. The agent encrypts it on the server, drops it in the customer's S3 bucket — Cloudflare R2, AWS S3, anything that speaks S3 — and the platform keeps only its address and a summary without a single name. Restoring means giving the machine back as it was, projects started.

The types are in `packages/shared/src/backup/` (format, manifest, declaration) and `packages/shared/src/agent-protocol/backup.ts` (commands). The decision is [0013](../decisions/0013-encrypted-s3-backups.md).

## What a backup contains

A backup is a bucket prefix, one object per part, and a `manifest.json` written last:

```txt
<prefix>/<server_id>/<backup_id>/
  manifest.json                      in clear, no secret
  setup.pupitre                      configuration, registry, module secrets
  home.pupitre                       keys and sessions of the dev account
  db-postgres-roles.pupitre          PostgreSQL roles (pg_dumpall --roles-only)
  db-postgres-flyleaf.pupitre        one database, pg_dump --format=custom
  db-mysql-users.pupitre             hand-made MySQL accounts, hashes and grants
  db-mysql-intranet.pupitre          one database, mysqldump
  db-mongodb-app.pupitre             one database, mongodump --archive
  db-redis.pupitre                   the RDB snapshot
  project-intranet.pupitre           the project folder, .git included
  path-notes.pupitre                 an extra folder of /home/dev
```

`backup_id` is `YYYYMMDDTHHMMSSZ-xxxxxx` (UTC, six randomly drawn hexadecimal digits): it sorts by date. `server_id` is the server's identifier on the platform, which `/agent/state` now returns and which the agent keeps in `/etc/pupitre/server.id`.

| Part | Content (in clear, before gzip) | When |
| --- | --- | --- |
| `setup` | a tar of `etc/pupitre/install.json`, `etc/pupitre/projects.local.json`, `etc/pupitre/projects.conf`, `etc/pupitre/migrations.json`, `etc/pupitre/env`, `var/lib/pupitre/projects.running.json` — those that exist | always |
| `home` | a tar, relative to `/home/dev`, of the entries of `BACKUP_HOME_PATHS` that exist, without `BACKUP_HOME_EXCLUDED` (`.ssh/authorized_keys`, and `.claude/remote`, the binaries Claude redownloads); restored file by file, each written beside then renamed into place, so a running binary is replaced rather than refused (`text file busy`) | `home` ticked (default) |
| `database` | one database per part, in the format `format` says; `name: "*"` for what belongs to the whole server: PostgreSQL roles (`pg_roles`), hand-made MySQL or MariaDB accounts (`mysql_users`: each dropped then recreated with its password hash — in hexadecimal on MySQL 8 —, then its grants once all accounts are made; `root`, the system accounts and the module's two accounts are never in it, the module remakes them), the Redis snapshot (`rdb`) | `databases` ticked (default), for each installed engine; system databases (`postgres`, `template*`, `mysql`, `sys`, `information_schema`, `performance_schema`, `admin`, `config`, `local`) are not part of it |
| `project` | `full` mode: a tar of the project folder, `.git` included, without the `BACKUP_EXCLUDED_DIRS` folders at any depth; `env` mode: only the git-ignored files whose name starts with `.env`, at the root and in each process's folder | `projects` ticked (default); the mode follows `projects_env_only`, and a project without a repository is always `full` |
| `path` | a tar of one path of `extra_paths`, relative to `/home/dev` | one per path |

`install.json` carries the modules' secrets in clear — database passwords, tool tokens, model provider keys, tunnel identifiers: that is what makes a restore ask for nothing. The tar keeps modes, internal symbolic links and dates; extraction gives everything back to the `dev` account (or root for `setup`), refuses an absolute path, a `..` and a link that would leave its root.

A project folder or an `extra_paths` path that is itself a link is followed if it leads to a folder of `/home/dev`: the part carries what it finds there, under the link's name, and the restore puts it back where the link leads, the link kept. Links met inside are never followed. A link that leads outside `/home/dev`, or nowhere, leaves the part aside with a warning, never an empty archive.

What is never in it: `server.token`, `platform.url`, `license.json`, SSH host keys, `authorized_keys`, binaries, packages, runtimes, project dependencies, logs, the screenshot gallery, Docker volumes.

## Encryption

The customer chooses a **passphrase**, once, on their laptop. The app draws a 16-byte salt, derives a 32-byte X25519 private key through PBKDF2-HMAC-SHA256 (600,000 rounds), draws the public key from it — the *recipient* — **then forgets the passphrase and the private key**. Nothing keeps the passphrase: not the app, not its keychain, not the server, not the platform. Only the recipient and the salt, which are not secrets, are kept and go to the server.

- **The server encrypts and cannot decrypt.** Each part is sealed for the recipient: an exposed bucket, a curious host, a leaked S3 key yield only opaque bytes.
- **The passphrase and a manifest suffice.** The manifest carries the recipient, the algorithm, the rounds and the salt. From any computer, the typed passphrase gives the key back; the app compares the derived recipient with the manifest's before sending anything, and a wrong passphrase is refused on the laptop.
- **One identity per organization.** A second computer of the organization takes the recipient and the salt of the latest backup the platform lists: the passphrase is not asked again to configure, only to restore. Changing the passphrase draws a new salt; later backups use it, older ones stay opened by the old one.
- **Restoring asks for the passphrase.** The app asks for it, derives, verifies, and sends the private key on the secrets line of a restore command. The agent uses it in memory, writes it nowhere and does not log it. Between putting the configuration in place and the return of the data — installation and hardening, a few minutes — the app's main process keeps the derived key in memory for that server alone, never on disk or in the window, and erases it as soon as the data is back or the restore is abandoned; an app relaunched in between asks for the passphrase again.
- **Lost, the passphrase makes backups unreadable.** Nobody can recover it, and the app says so when it is chosen.

### The container

Each part is `gzip`ped then sealed, as a stream, in the container that `BACKUP_CONTAINER` describes:

```txt
header   "PUPITRE\x01" · ephemeral X25519 public key (32) · nonce prefix (8) · block size, big-endian uint32 (4)
key      HKDF-SHA256(X25519(ephemeral, recipient), salt = header, info = "pupitre-backup-v1"), 32 bytes
blocks   AES-256-GCM, nonce = prefix · big-endian uint32 counter, aad = [1 for the last block, 0 otherwise]
```

Each block except the last is exactly the block size (1 MiB when writing); the last is smaller, possibly empty, and only it is sealed as final: a truncation does not open. `fixtures.json` carries the vectors that Go and TypeScript verify; `contracts:export` copies it into `apps/agent/internal/contract/backup.fixtures.json`.

### Integrity

The manifest carries the `sha256` of each encrypted object; the platform keeps the manifest's, and the app passes it in `location.sha256`. The agent refuses a manifest whose hash differs (`backup_corrupt`), then each part whose hash differs, before decrypting it. A part sealed by a third party who knew the recipient therefore cannot slip into a backup the platform has recorded.

## The `core.backup` module

Category `core`, optional, `runs: false`, `connection: "backup"`. It installs nothing on the machine apart from its configuration in `install.json`.

| Field | Kind | Default | Note |
| --- | --- | --- | --- |
| `endpoint` | text, pattern `BACKUP_ENDPOINT_PATTERN`, managed | — | `https://<account>.r2.cloudflarestorage.com`, `https://s3.<region>.amazonaws.com`. HTTPS only: in clear, each request's signature and the key identifier would travel over the network, replayable. Self-hosted storage goes behind TLS |
| `region` | text, managed | `auto` | |
| `bucket` | text, managed | — | |
| `prefix` | text, managed | `pupitre` | no trailing slash |
| `path_style` | boolean, managed | true | false for a provider that requires virtual addressing |
| `access_key_id` | text, managed | — | |
| `secret_access_key` | secret, managed | — | |
| `recipient` | text, managed | — | the public key, base64 |
| `kdf_salt` | text, managed | — | the salt, base64 |
| `interval_hours` | number 0–720 | 24 | 0: no scheduled backup, on demand only |
| `hour` | number 0–23 | 3 | server local hour at which a backup of a day or more starts |
| `keep` | number 1–365 | 14 | scheduled backups kept; manual ones are never pruned |
| `databases` | boolean | true | |
| `home` | boolean | true | keys and sessions of the `dev` account |
| `projects` | boolean | true | the registry's projects |
| `projects_env_only` | boolean | false | of projects with a repository, only the `.env*` files: `env` mode; unticked, `full` mode. A project without a repository is always `full` |
| `extra_paths` | list of text, pattern `BACKUP_EXTRA_PATH_PATTERN` | empty | paths relative to `/home/dev` |
| `exclude_projects` | list of text, pattern `BACKUP_PROJECT_ITEM_PATTERN` | empty | the projects left out of backups, by name |
| `exclude_databases` | list of text, pattern `BACKUP_DATABASE_ITEM_PATTERN` | empty | the databases left out of backups: `postgres:shop`, `mysql:intranet`, `mongodb:app`, `redis:*` |

**Everything goes by default.** The settings name what stays out, never what goes: a project or a database created after the settings is backed up until someone unticks it — a backup believed complete that forgets the latest project would be the worst. `databases` and `projects` remain the switches of the whole category. PostgreSQL roles and MySQL accounts go with their engine as soon as one of its databases goes: a restored database needs its owners. `backup.contents` returns the list the app ticks, with for each item whether it goes today, and the manifest keeps in `excluded` what stayed out.

**What a restore does with an item left out.** On a new server, an excluded project that has a repository is cloned and installed — its code comes back, not its work in progress — and an excluded project without a repository leaves the registry, nothing being able to bring it back; an excluded database is not created. Both are said in `warnings`. On a server being put back to a backup, what was excluded stays as it is: neither deleted nor removed from the registry.

The preflight (`install.check`) verifies what only the machine knows: `HeadBucket`, then writing and deleting a probe object under `<prefix>/<server_id>/`. Each refusal carries its remedy: unknown bucket, access denied, unreachable endpoint, skewed clock (`RequestTimeTooSkewed`). It only judges if the server already holds the secret key — `install.check` carries no secret — and then returns a `connection` problem of the module; on first installation, it is the `verify-bucket` step of `Configure` that does the same probe with the key from the secrets line, and fails with the same remedy.

## How a backup runs

1. Take the engine lock (`install.lock`): a backup never crosses another, nor an installation.
2. Draw the identifier, read the last successful backup in `/var/lib/pupitre/backup.json`.
3. For each part, in the order `setup`, `home`, databases, projects, paths: compute its source fingerprint when it has one (a folder: paths, sizes, modes, dates; a file: its content). If it equals that of the same part in the previous backup, for the same recipient, **copy the object within the bucket** (`CopyObject`) instead of sending it again. Otherwise, produce the source as a stream — `pg_dump` → gzip → sealing → multipart upload in 8 MiB parts — with no temporary file on the server's disk.
4. A part that fails is noted in `warnings` with its sentence and does not stop the others; a `setup` that fails stops everything, because a backup without configuration is not one.
5. Write `manifest.json`, then declare the backup to the platform (`POST /agent/backups`). A declaration that fails is retried by the daemon on its next round.
6. Prune: list `<prefix>/<server_id>/`, read the manifests, keep the `keep` most recent scheduled backups, delete the others object by object then tell the platform which are gone (`DELETE /agent/backups/:id`). A prefix without a manifest older than a day is an interrupted upload: it goes too, along with abandoned multipart uploads.
7. Write `/var/lib/pupitre/backup.json`: `{ running_since?, running_pid?, last_run_at, last_ok_at?, last_error?, last: { id, key, bytes, recipient, endpoint, bucket, parts[] }, pending_declarations[], pending_forgets? }`. `running_since` and `running_pid` — the process doing it — are set for the duration of a backup: `backup.status` only says it is running if that process lives, without ever taking the engine lock to check; `last` keeps what is needed to copy in the same bucket and for the same recipient; `pending_forgets` names the pruned backups whose `DELETE` the platform has not yet received, retried by the daemon like the declarations.

Heavy commands run under `nice 10` and `ionice -c3`. Engine secrets pass as for `db.dump`: never on a command line.

## Scheduling

The daemon reads `install.json` on each thirty-second round. When `core.backup` is installed and configured, `interval_hours` is positive and the due time has passed, it launches a `schedule` backup. The due time follows the last attempt: `last_run_at + interval_hours`; an interval of a day or more aligns on `hour`, server local time. A due time missed during a shutdown is caught up once on waking; a server that has never backed up starts at `hour` the same day, or right away if the hour has passed. A held lock makes it wait for the next round. A server in restricted mode does not back up; in grace, it does.

The heartbeat carries `backup: BackupBeat` — `{ interval_hours, last_run_at?, last_ok_at?, last_error?, last_warnings? }` — when the module is installed. `last_warnings` counts the parts the last backup could not take along; `backup.status` returns their sentences in `last.warnings`, and the app shows them under the state. An incomplete backup exists, but what it lacks would not come back: it is a failure for alerts.

## Commands

In `agent-protocol.md`, "Backups" section. None is open in restricted mode nor before enrolment; none is while the configuration awaits a migration.

| Command | Role |
| --- | --- |
| `backup.status` | where this server's backups stand |
| `backup.contents` | the projects and databases this server holds, and whether each goes into backups |
| `backup.run` | a backup now, with the optional name the reader gives it (`name`, 80 characters at most, no space at the edges nor control character — `BACKUP_NAME_PATTERN`), carried by the manifest and the declaration; `step` events of the `core.backup` module (`setup`, `home`, `db:<engine>:<name>`, `project:<name>`, `path:<path>`, `manifest`, `declare`, `prune`) |
| `backup.delete` | deletes a backup of this server in the bucket, then on the platform |
| `backup.inspect` | reads and verifies a backup's manifest, writing nothing |
| `backup.restore.setup` | puts a backup's configuration in place, migrated to the binary's revision |
| `backup.restore.data` | brings back databases, projects, paths and `home`, then starts the projects |
| `backup.restore.abort` | abandons a restore begun before its installation |

`backup.inspect`, `backup.restore.setup` and `backup.restore.data` read the `BackupSecrets` secrets line: the S3 key and, for a restore, the private key.

## Restoring

Two cases, one path.

**A new server**, during onboarding. `backup.restore.setup` refuses a machine that already has an installation, unless the only configuration it carries comes from a restore in progress.

**An existing server being put back to a backup** (`revert: true`). The app first offers a backup of the current state, ticked by default: that is what lets you go back from the going back. Then the agent stops all projects, puts the backup's configuration and registry in place; projects the backup does not know leave the registry (`dropped`), their folders stay. `extra` names the installed modules the backup does not hold; the app offers to uninstall them.

In both cases:

1. **`backup.restore.setup`** downloads the manifest, verifies its hash, then `setup`, decrypts it, reads its revision: behind, it is migrated by the migration registry exactly like a configuration in place; ahead, `backup_unsupported` refusal with the remedy "update the agent". An unknown manifest format refuses likewise. The files are put in place, a `/var/lib/pupitre/restore.json` mark says a restore is in progress and from which backup.
2. **The installation**: the app names `modules` and `defer`, `module.config` hands it each one's values, and the restored secrets are held as owned — a secret absent from the secrets line is not erased. A connection this laptop does not have does not block a restored module: its managed fields are already on the machine.
3. **Hardening**, for a new server.
4. **`backup.restore.data`**, the chosen parts, in the order `home`, databases, paths, projects. A database is recreated by its import, and nothing is deleted before the disk has been weighed: the part is read once in full for its size, and if the engine's data disk, accounting for what the deletion frees, does not hold it with a 512 MiB margin, the part fails with the space needed and the database stays as it is. PostgreSQL sets the previous database aside under another name, gives it back its name if the import fails and deletes it only once the import has passed; MySQL and MongoDB cannot rename a database — a MySQL dump names its own in its views and triggers —, they delete it just before the import. A Redis snapshot is written beside the server's file and replaces it only whole; Redis is restarted on its earlier data if the write fails. PostgreSQL roles come before databases, a role already there is not an error. A `full` project has its folder replaced entirely — branch, modified files, unpushed commits come back as they were, with no clone; an `env` project is cloned (`project.pull`) then receives its `.env*` files. Each project then receives what `project.add` does after its line: `.localhost` hosts, exposure routes, runtime pins, `project.install`. Finally, with `start` (default), the projects the manifest says were running are started, and those that start at boot too. A part that fails is noted `failed` with its replay command and does not stop the others. The restore mark is erased at the end.

The steps of `backup.restore.data` are named like those of a backup for the parts, then `hosts`, `runtimes`, `routes`, `install:<project>` and `start:<project>`. A restore has no command on the machine — the private key does not stay there —: the `replay` of a failed step is the request the app sends again, `backup.restore.data {"parts":["<key>"]}`, `project.install {"name":"<project>"}`, `project.up {"name":"<project>"}` or `tunnel.sync`; an excluded project that the restore clones or removes from the registry goes through a `project:<project>` step, replayed by `project.pull` or `project.remove`. A step after the parts that fails goes into `warnings`, not `failed`, which names only parts.
5. **The app** calls `platform.sync`, then `POST /backups/:id/restored`.

`backup.restore.abort` erases the mark and, if no installation has taken place since, puts back the configuration from before the restore: nothing for a new server — `install.json` and the registry empty —, the one the machine carried for a `revert`. `backup.restore.setup` keeps it aside for that under `/var/lib/pupitre/restore/before/` (0700 root), on the first restore only, and the mark retains the hash of `install.json` as the restore left it: an installation run since changes it, and the abort then erases only the mark.

A customer opens a part without Pupitre: `pupitred backup open --salt=<manifest salt> FILE` reads the passphrase on standard input, `pupitred backup open --private-key FILE` the private key, and the part comes out decrypted and decompressed on standard output.

## The platform

A `Backup` table, routes, two alerts. The detail is in [platform-api.md](./platform-api.md#backups).

- `POST /agent/backups` (server token) declares a backup, `BackupDeclaration`; idempotent on the identifier.
- `DELETE /agent/backups/:id` (server token) removes the reference to a backup of this server.
- `GET /backups` and `GET /servers/:id/backups` (session) list the organization's backups, most recent first; a `member` sees only those of the servers assigned to them. Each row is a `PlatformBackup` (`@pupitre/shared/backup`): the declaration, plus `server_id` and `server_name`. The route and the app take it from there; `created_at` and the heartbeat dates follow `InstantSchema`.
- `POST /backups/:id/forget` (`admin`) deletes a reference without touching the bucket.
- `POST /backups/:id/restored` (session) notes a restore in the log.
- `backup_failed` when the last heartbeat carries an error more recent than the last success, or an incomplete last backup (`last_warnings` positive); `backup_stale` when two intervals have passed without success.

## The app

- **A server's Backups page** — the setup wizard, then the Destination tab, which applies to the server any change as soon as it is saved; nothing left in Settings: endpoint, region, bucket, prefix, addressing, access key and secret key (in the keychain), and the passphrase — typed twice, or generated, then forgotten. If the organization already has backups, the most recent one's identity is taken without a passphrase.
- **The server's record, Backups section**: the state, the module's form (interval, hour, retention, contents), "Back up now", the list read from the platform with, for each, "Revert to this backup" and "Delete".
- **Onboarding**: when the organization has backups, the "Start from a backup?" step comes after the agent and before the catalogue; the "Data" step comes after hardening.

## Limits

- Docker volumes are not backed up; the app says so when `runtime.docker` is installed.
- A database password changed by hand outside Pupitre reverts to the one `install.json` holds.
- The platform sees an address, sizes, accounts, a revision, a public key and, for a manual backup, the name the reader gave it; it sees no project or database name.
- Whoever holds the S3 key can delete the backups: bucket versioning or object locking is the remedy, and the guide mentions them.
- Whoever reads the bucket reads the manifests, in clear: the server name, the names of projects, databases and folders, the address and branch of repositories. Never a content, a secret or a file: those are sealed. That is the price of a restore screen that shows what a backup contains before the passphrase is given, and the guide says so.
- Confidentiality is end to end; the authenticity of a backup rests on the hash of its manifest that the platform keeps. A compromised platform would read nothing, but could point to an older backup of the same customer in place of the latest.
- The key derives from the passphrase by PBKDF2-SHA256 at 600,000 rounds, at the level recommended today; a typed passphrase of twelve characters is the weak link, and the app offers a drawn passphrase of 120 bits.
