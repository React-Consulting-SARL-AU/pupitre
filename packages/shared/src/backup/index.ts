import { z } from "zod"

/**
 * A backup of a Pupitre server, as it lies in the client's own S3 bucket.
 *
 * One prefix per backup, one object per part, every part encrypted on the
 * server to a public key the server cannot open, and a manifest in clear that
 * names and binds them. The platform keeps a summary and the address, never
 * the contents. See `docs/contracts/backups.md`.
 */

export const BACKUP_FORMAT = 1

export const BACKUP_MODULE_ID = "core.backup"

export const BACKUP_MANIFEST_KEY = "manifest.json"

/** `20260919T031500Z-7f3a2c`: sortable by time, unique per server. */
export const BACKUP_ID_PATTERN = "^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}$"

export const BackupIdSchema = z.string().regex(new RegExp(BACKUP_ID_PATTERN))

export type BackupId = z.infer<typeof BackupIdSchema>

export const BACKUP_TRIGGERS = ["schedule", "manual"] as const

export const BackupTriggerSchema = z.enum(BACKUP_TRIGGERS)

export type BackupTrigger = z.infer<typeof BackupTriggerSchema>

/**
 * The name the reader gives a manual backup, shown beside its date. The
 * platform keeps it with the reference: it is the one word of a declaration
 * that the reader wrote, never the name of anything the backup holds.
 */
export const BACKUP_NAME_MAX = 80

/** No control character, no space at either end. */
export const BACKUP_NAME_PATTERN =
  "^[^\\s\\x00-\\x1f\\x7f](?:[^\\x00-\\x1f\\x7f]*[^\\s\\x00-\\x1f\\x7f])?$"

export const BackupNameSchema = z
  .string()
  .max(BACKUP_NAME_MAX)
  .regex(new RegExp(BACKUP_NAME_PATTERN))

/**
 * The interval between two scheduled backups, in hours; 0 turns the schedule
 * off and leaves the manual backup. An interval of a day or more starts at
 * `hour`, the server's local time, so a daily backup lands at night.
 */
export const BACKUP_INTERVAL_DEFAULT_HOURS = 24

export const BACKUP_INTERVAL_MAX_HOURS = 720

export const BackupIntervalSchema = z
  .int()
  .min(0)
  .max(BACKUP_INTERVAL_MAX_HOURS)

export type BackupInterval = z.infer<typeof BackupIntervalSchema>

/**
 * `full` carries each project's folder as it is, `.git` included, so work in
 * progress comes back; `env` carries only its ignored `.env*` files and lets
 * the clone bring the code back; `none` carries no project at all. A project
 * without a repository is always `full`: nothing else could bring it back.
 */
export const BACKUP_PROJECT_MODES = ["full", "env", "none"] as const

export const BackupProjectModeSchema = z.enum(BACKUP_PROJECT_MODES)

export type BackupProjectMode = z.infer<typeof BackupProjectModeSchema>

/**
 * How many scheduled backups of a server stay in the bucket; the oldest beyond
 * that are deleted after each new one. A manual backup is never pruned: it was
 * asked for, and it goes when someone deletes it.
 */
export const BACKUP_KEEP_DEFAULT = 14

export const BACKUP_KEEP_MAX = 365

export const BACKUP_HOUR_DEFAULT = 3

/** Directories a `full` project archive leaves out at any depth: what `project.install` or a build puts back. */
export const BACKUP_EXCLUDED_DIRS = [
  "node_modules",
  ".pnpm-store",
  "vendor",
  "target",
  "build",
  "dist",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".venv",
  "__pycache__",
  ".gradle",
  ".cache",
] as const

/**
 * What of the dev user's home makes the machine usable as it was: the keys git
 * pushes with, the git identity, and the sessions of `gh` and of the coding
 * agents, so nobody logs in again after a restore. Whichever exist are carried
 * in one `home` part; `.ssh/authorized_keys` never is — the platform rewrites
 * its block every thirty seconds, and a restored one would open the machine to
 * keys the platform has revoked.
 */
export const BACKUP_HOME_PATHS = [
  ".ssh",
  ".gitconfig",
  ".git-credentials",
  ".config/gh",
  ".claude",
  ".claude.json",
  ".codex",
  ".gemini",
  ".cursor",
  ".copilot",
  ".config/opencode",
  ".openclaw",
  ".config/hermes",
  ".npmrc",
  ".docker/config.json",
  ".zsh_history",
] as const

export const BACKUP_HOME_EXCLUDED = [".ssh/authorized_keys"] as const

/**
 * A path under the dev user's home, relative, one segment at a time, where no
 * segment is `.` or `..`. Written in the RE2 subset so the agent reads it as is.
 */
const SEGMENT = "([A-Za-z0-9_~@+-]|\\.[A-Za-z0-9_~@+-])[A-Za-z0-9._~@+-]*"

export const BACKUP_EXTRA_PATH_PATTERN = `^${SEGMENT}(/${SEGMENT})*/?$`

export const BACKUP_DATABASE_ENGINES = [
  "postgres",
  "mysql",
  "mongodb",
  "redis",
] as const

export const BackupDatabaseEngineSchema = z.enum(BACKUP_DATABASE_ENGINES)

export type BackupDatabaseEngine = z.infer<typeof BackupDatabaseEngineSchema>

/**
 * A database as the settings name it: `postgres:shop`, `mysql:intranet`,
 * `mongodb:app`, and `redis:*` for the Redis snapshot, which has no name.
 * What belongs to a whole engine — Postgres roles, MySQL accounts — is not an
 * item: it goes with its engine, since a restored database needs its owners.
 */
export const BACKUP_DATABASE_ITEM_PATTERN =
  "^((postgres|mysql|mongodb):[A-Za-z0-9_-]{1,64}|redis:\\*)$"

export function backupDatabaseItem(
  engine: BackupDatabaseEngine,
  name: string
): string {
  return `${engine}:${name}`
}

/** A project as the settings name it: its name in the registry. */
export const BACKUP_PROJECT_ITEM_PATTERN = "^[a-z0-9][a-z0-9._-]*$"

/**
 * What the settings left out of a backup, recorded in its manifest. Everything
 * the server holds goes by default: a project or a database made after the
 * settings is backed up until someone unticks it.
 *
 * On a fresh server, an excluded project with a repository is cloned — its
 * code comes back, not its work in progress — and one without leaves the
 * registry, since nothing could bring it back; an excluded database is not
 * created. On a server taken back to the backup, what was excluded is left as
 * it is.
 */
export const BackupExcludedSchema = z.object({
  projects: z.array(z.string().regex(new RegExp(BACKUP_PROJECT_ITEM_PATTERN))),
  databases: z.array(
    z.string().regex(new RegExp(BACKUP_DATABASE_ITEM_PATTERN))
  ),
})

export type BackupExcluded = z.infer<typeof BackupExcludedSchema>

/**
 * What the plaintext of a database part is, before gzip.
 *
 * `pg_roles` is the output of `pg_dumpall --roles-only`: the roles a client made
 * by hand next to the ones the module makes, so a project that connects with
 * one of them still connects after a restore. `mysql_users` is the same for
 * MySQL and MariaDB: each account made by hand, dropped, created again with its
 * password digest, then granted what it had.
 */
export const BACKUP_DUMP_FORMATS = [
  "pg_custom",
  "pg_roles",
  "sql",
  "mysql_users",
  "mongo_archive",
  "rdb",
] as const

export const BackupDumpFormatSchema = z.enum(BACKUP_DUMP_FORMATS)

export type BackupDumpFormat = z.infer<typeof BackupDumpFormatSchema>

/**
 * The key derivation, fixed for a format version.
 *
 * The passphrase is taken as UTF-8 after trimming surrounding whitespace and
 * NFC normalisation. The salt is drawn once per identity and travels in clear
 * in every manifest: the passphrase and a manifest are all it takes to open a
 * backup, from any computer.
 */
export const BACKUP_KDF = {
  alg: "pbkdf2-sha256",
  iterations: 600_000,
  saltBytes: 16,
  keyBytes: 32,
} as const

/**
 * The container of a part: a 52-byte header, then AES-256-GCM chunks.
 *
 * header = magic (8) · ephemeral X25519 public key (32) · nonce prefix (8) · chunk size, uint32 big-endian (4)
 * key    = HKDF-SHA256(X25519(ephemeral, recipient), salt = header, info = "pupitre-backup-v1"), 32 bytes
 * chunk  = AES-256-GCM(key, nonce = prefix · counter uint32 big-endian, aad = [final ? 1 : 0])
 *
 * Every chunk but the last holds exactly `chunkBytes` of plaintext; the last
 * holds fewer, possibly none, and is the only one sealed as final, so a
 * truncation at a chunk boundary does not open.
 */
export const BACKUP_CONTAINER = {
  magic: "PUPITRE\u0001",
  headerBytes: 52,
  chunkBytes: 1_048_576,
  minChunkBytes: 16,
  maxChunkBytes: 16_777_216,
  tagBytes: 16,
  info: "pupitre-backup-v1",
} as const

const Base64Schema = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/)

/** A 32-byte X25519 public key, standard base64. Not a secret. */
export const BackupRecipientSchema = Base64Schema.length(44)

export const BackupSaltSchema = Base64Schema.length(24)

export const BackupKdfSchema = z.object({
  alg: z.literal(BACKUP_KDF.alg),
  iterations: z.int().positive(),
  salt: BackupSaltSchema,
})

export type BackupKdf = z.infer<typeof BackupKdfSchema>

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)

/**
 * HTTPS only: over plain HTTP, every request's signature and the access key's
 * identifier cross the network in clear, open to a replay. The contents stay
 * sealed either way; the credentials would not. A self-hosted store puts TLS
 * in front of itself.
 */
export const BACKUP_ENDPOINT_PATTERN = "^https://[^\\s/?#]+(/[^\\s?#]*)?$"

/** A bucket name as S3 and R2 accept it: it reaches a request path as it is. */
export const BACKUP_BUCKET_PATTERN = "^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$"

/** `auto` for R2, `eu-west-3` for AWS: it signs every request. */
export const BACKUP_REGION_PATTERN = "^[a-z0-9-]{1,64}$"

/**
 * Where a backup lies. `key` is the backup's own prefix, without a trailing
 * slash: `<prefix>/<server_id>/<backup_id>`. `sha256` is the digest of its
 * `manifest.json`, the one the platform recorded: the agent refuses a manifest
 * that does not match it, and each part is bound to the manifest by its own.
 */
export const BackupLocationSchema = z.strictObject({
  endpoint: z.string().regex(new RegExp(BACKUP_ENDPOINT_PATTERN)),
  region: z.string().regex(new RegExp(BACKUP_REGION_PATTERN)),
  bucket: z.string().regex(new RegExp(BACKUP_BUCKET_PATTERN)),
  key: z.string().min(1).max(512),
  path_style: z.boolean(),
  sha256: Sha256Schema.optional(),
})

export type BackupLocation = z.infer<typeof BackupLocationSchema>

/**
 * `key` is relative to the backup's prefix: every backup holds all its objects,
 * so deleting an old one never breaks a newer one.
 *
 * `fingerprint` is a digest of what the part was made from — for a folder,
 * every path, size, mode and modification time under it; for a file, its
 * content. When the next backup computes the same fingerprint for the same
 * recipient, it copies the earlier object inside the bucket (a server-side
 * `CopyObject`) instead of sending it again: nothing leaves the server for a
 * project nobody touched.
 */
export const BackupPartKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9._-]+\.pupitre$/)

const PartBaseSchema = z.object({
  key: BackupPartKeySchema,
  bytes: z.int().nonnegative(),
  sha256: Sha256Schema,
  fingerprint: Sha256Schema.optional(),
})

export const BackupSetupPartSchema = PartBaseSchema.extend({
  kind: z.literal("setup"),
})

export const BackupDatabasePartSchema = PartBaseSchema.extend({
  kind: z.literal("database"),
  engine: BackupDatabaseEngineSchema,
  /** The database's name; `*` for what belongs to the whole server — Postgres roles, the Redis snapshot. */
  name: z.string().min(1).max(128),
  format: BackupDumpFormatSchema,
})

export const BackupGitStateSchema = z.object({
  repo: z.string(),
  branch: z.string(),
  dirty: z.int().nonnegative(),
  ahead: z.int().nonnegative(),
})

export type BackupGitState = z.infer<typeof BackupGitStateSchema>

export const BackupProjectPartSchema = PartBaseSchema.extend({
  kind: z.literal("project"),
  name: z.string().min(1),
  mode: z.enum(["full", "env"]),
  git: BackupGitStateSchema.optional(),
})

export const BackupPathPartSchema = PartBaseSchema.extend({
  kind: z.literal("path"),
  path: z.string().regex(new RegExp(BACKUP_EXTRA_PATH_PATTERN)),
})

/** `paths` names the entries of `BACKUP_HOME_PATHS` that existed and were carried. */
export const BackupHomePartSchema = PartBaseSchema.extend({
  kind: z.literal("home"),
  paths: z.array(z.string()),
})

export const BackupPartSchema = z.discriminatedUnion("kind", [
  BackupSetupPartSchema,
  BackupHomePartSchema,
  BackupDatabasePartSchema,
  BackupProjectPartSchema,
  BackupPathPartSchema,
])

export type BackupPart = z.infer<typeof BackupPartSchema>

export const BACKUP_PART_KINDS = [
  "setup",
  "home",
  "database",
  "project",
  "path",
] as const

export type BackupPartKind = (typeof BACKUP_PART_KINDS)[number]

export const BackupServerSchema = z.object({
  id: z.string().min(1),
  hostname: z.string(),
  arch: z.string(),
  agent_version: z.string(),
  config_revision: z.int().nonnegative(),
})

/**
 * The manifest, in clear, written last: a prefix without one is an interrupted
 * upload that the next backup cleans away. It names projects and databases
 * because the restore screen has to show them; it stays in the client's bucket.
 */
export const BackupManifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  id: BackupIdSchema,
  created_at: z.string(),
  trigger: BackupTriggerSchema,
  /** Absent from a scheduled backup, and from a manual one left unnamed. */
  name: BackupNameSchema.optional(),
  server: BackupServerSchema,
  recipient: BackupRecipientSchema,
  kdf: BackupKdfSchema,
  modules: z.array(z.string()),
  /** The projects that were running when the backup was made: a restore starts them again. */
  running: z.array(z.string()),
  /** Absent in a backup made before the settings could leave anything out. */
  excluded: BackupExcludedSchema.optional(),
  parts: z.array(BackupPartSchema).min(1),
  warnings: z.array(z.string()),
})

export type BackupManifest = z.infer<typeof BackupManifestSchema>

export const BackupCountsSchema = z.object({
  setup: z.boolean(),
  home: z.boolean(),
  databases: z.int().nonnegative(),
  projects: z.int().nonnegative(),
  paths: z.int().nonnegative(),
})

export type BackupCounts = z.infer<typeof BackupCountsSchema>

/**
 * What a server declares to the platform once a manifest is written: the
 * address, a summary without the name of anything it holds, and the name the
 * reader gave it, if any — so the platform learns that a backup exists and
 * where, and nothing of what it holds.
 */
export const BackupDeclarationSchema = z.object({
  id: BackupIdSchema,
  created_at: z.string(),
  trigger: BackupTriggerSchema,
  name: BackupNameSchema.optional(),
  bytes: z.int().nonnegative(),
  counts: BackupCountsSchema,
  config_revision: z.int().nonnegative(),
  agent_version: z.string().min(1),
  recipient: BackupRecipientSchema,
  kdf_salt: BackupSaltSchema,
  location: BackupLocationSchema.required({ sha256: true }),
})

export type BackupDeclaration = z.infer<typeof BackupDeclarationSchema>

/**
 * The heartbeat's word on backups, enough for the console and the alerts.
 * `last_warnings` counts the parts the last backup could not carry — a
 * database that did not dump, a project that did not archive: that backup
 * exists, and it is incomplete, which the alerts treat as a failure.
 */
export const BackupBeatSchema = z.object({
  interval_hours: BackupIntervalSchema,
  last_run_at: z.string().optional(),
  last_ok_at: z.string().optional(),
  last_error: z.string().max(500).optional(),
  last_warnings: z.int().nonnegative().optional(),
})

export type BackupBeat = z.infer<typeof BackupBeatSchema>

/** A scheduled backup is late once two intervals have gone by without one succeeding. */
export function backupStaleAfterHours(intervalHours: number): number | null {
  return intervalHours > 0 ? intervalHours * 2 : null
}

export function countsOf(parts: readonly BackupPart[]): BackupCounts {
  return {
    setup: parts.some((part) => part.kind === "setup"),
    home: parts.some((part) => part.kind === "home"),
    databases: parts.filter((part) => part.kind === "database").length,
    projects: parts.filter((part) => part.kind === "project").length,
    paths: parts.filter((part) => part.kind === "path").length,
  }
}
