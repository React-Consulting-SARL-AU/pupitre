import { z } from "zod"
import { InstantSchema } from "../platform-api"

export const BACKUP_FORMAT = 1

export const BACKUP_MODULE_ID = "core.backup"

// `20260919T031500Z-7f3a2c`: sortable by time, unique per server.
export const BACKUP_ID_PATTERN = "^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}$"

export const BackupIdSchema = z.string().regex(new RegExp(BACKUP_ID_PATTERN))

const BACKUP_TRIGGERS = ["schedule", "manual"] as const

const BackupTriggerSchema = z.enum(BACKUP_TRIGGERS)

export type BackupTrigger = z.infer<typeof BackupTriggerSchema>

// The platform keeps the name: the one word of a declaration the reader wrote, never what the backup holds.
export const BACKUP_NAME_MAX = 80

// No control character, no space at either end.
export const BACKUP_NAME_PATTERN =
  "^[^\\s\\x00-\\x1f\\x7f](?:[^\\x00-\\x1f\\x7f]*[^\\s\\x00-\\x1f\\x7f])?$"

export const BackupNameSchema = z
  .string()
  .max(BACKUP_NAME_MAX)
  .regex(new RegExp(BACKUP_NAME_PATTERN))

export const BACKUP_INTERVAL_DEFAULT_HOURS = 24

export const BACKUP_INTERVAL_MAX_HOURS = 720

// 0 turns the schedule off; a day or more starts at `hour`, server time, so a daily backup lands at night.
export const BackupIntervalSchema = z
  .int()
  .min(0)
  .max(BACKUP_INTERVAL_MAX_HOURS)

// `env` carries only the ignored `.env*`; a project without a repository is always `full`.
const BACKUP_PROJECT_MODES = ["full", "env", "none"] as const

export const BackupProjectModeSchema = z.enum(BACKUP_PROJECT_MODES)

// Counts scheduled backups only: a manual one was asked for, and goes when someone deletes it.
export const BACKUP_KEEP_DEFAULT = 14

export const BACKUP_KEEP_MAX = 365

export const BACKUP_HOUR_DEFAULT = 3

// Left out at any depth: what `project.install` or a build puts back.
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

// The platform rewrites authorized_keys; a running Claude binary cannot be written over.
export const BACKUP_HOME_EXCLUDED = [
  ".ssh/authorized_keys",
  ".claude/remote",
] as const

// Written in the RE2 subset so the agent reads it as is.
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

// Engine-wide state (roles, accounts) is not an item: it goes with its engine.
export const BACKUP_DATABASE_ITEM_PATTERN =
  "^((postgres|mysql|mongodb):[A-Za-z0-9_-]{1,64}|redis:\\*)$"

export const BACKUP_PROJECT_ITEM_PATTERN = "^[a-z0-9][a-z0-9._-]*$"

// A fresh server clones an excluded project, or drops it without a repository; the same server leaves it.
const BackupExcludedSchema = z.object({
  projects: z.array(z.string().regex(new RegExp(BACKUP_PROJECT_ITEM_PATTERN))),
  databases: z.array(
    z.string().regex(new RegExp(BACKUP_DATABASE_ITEM_PATTERN))
  ),
})

// `pg_roles` and `mysql_users` carry hand-made accounts, so projects still connect after a restore.
const BACKUP_DUMP_FORMATS = [
  "pg_custom",
  "pg_roles",
  "sql",
  "mysql_users",
  "mongo_archive",
  "rdb",
] as const

const BackupDumpFormatSchema = z.enum(BACKUP_DUMP_FORMATS)

// The passphrase is trimmed, NFC-normalised UTF-8; the salt travels in clear in every manifest.
export const BACKUP_KDF = {
  alg: "pbkdf2-sha256",
  iterations: 600_000,
  saltBytes: 16,
  keyBytes: 32,
} as const

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

// A 32-byte X25519 public key: not a secret.
export const BackupRecipientSchema = Base64Schema.length(44)

export const BackupSaltSchema = Base64Schema.length(24)

const BackupKdfSchema = z.object({
  alg: z.literal(BACKUP_KDF.alg),
  iterations: z.int().positive(),
  salt: BackupSaltSchema,
})

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)

// Over plain HTTP the request signatures and the access key id would cross in clear, open to a replay.
export const BACKUP_ENDPOINT_PATTERN = "^https://[^\\s/?#]+(/[^\\s?#]*)?$"

// It reaches a request path as it is.
export const BACKUP_BUCKET_PATTERN = "^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$"

export const BACKUP_REGION_PATTERN = "^[a-z0-9-]{1,64}$"

export const BackupLocationSchema = z.strictObject({
  endpoint: z.string().regex(new RegExp(BACKUP_ENDPOINT_PATTERN)),
  region: z.string().regex(new RegExp(BACKUP_REGION_PATTERN)),
  bucket: z.string().regex(new RegExp(BACKUP_BUCKET_PATTERN)),
  key: z.string().min(1).max(512),
  path_style: z.boolean(),
  // The digest of `manifest.json` the platform recorded: the agent refuses a manifest that does not match.
  sha256: Sha256Schema.optional(),
})

export type BackupLocation = z.infer<typeof BackupLocationSchema>

export const BackupPartKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9._-]+\.pupitre$/)

const PartBaseSchema = z.object({
  // Relative to the backup's prefix: deleting an old backup never breaks a newer one.
  key: BackupPartKeySchema,
  bytes: z.int().nonnegative(),
  sha256: Sha256Schema,
  // An unchanged fingerprint lets the next backup copy the object inside the bucket instead of uploading it.
  fingerprint: Sha256Schema.optional(),
})

const BackupSetupPartSchema = PartBaseSchema.extend({
  kind: z.literal("setup"),
})

const BackupDatabasePartSchema = PartBaseSchema.extend({
  kind: z.literal("database"),
  engine: BackupDatabaseEngineSchema,
  // `*` for what belongs to the whole server: Postgres roles, the Redis snapshot.
  name: z.string().min(1).max(128),
  format: BackupDumpFormatSchema,
})

const BackupGitStateSchema = z.object({
  repo: z.string(),
  branch: z.string(),
  dirty: z.int().nonnegative(),
  ahead: z.int().nonnegative(),
})

const BackupProjectPartSchema = PartBaseSchema.extend({
  kind: z.literal("project"),
  name: z.string().min(1),
  mode: z.enum(["full", "env"]),
  git: BackupGitStateSchema.optional(),
})

const BackupPathPartSchema = PartBaseSchema.extend({
  kind: z.literal("path"),
  path: z.string().regex(new RegExp(BACKUP_EXTRA_PATH_PATTERN)),
})

const BackupHomePartSchema = PartBaseSchema.extend({
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

const BackupServerSchema = z.object({
  id: z.string().min(1),
  hostname: z.string(),
  arch: z.string(),
  agent_version: z.string(),
  config_revision: z.int().nonnegative(),
})

// Written last: a prefix without a manifest is an interrupted upload the next backup cleans away.
export const BackupManifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  id: BackupIdSchema,
  created_at: z.string(),
  trigger: BackupTriggerSchema,
  name: BackupNameSchema.optional(),
  server: BackupServerSchema,
  recipient: BackupRecipientSchema,
  kdf: BackupKdfSchema,
  modules: z.array(z.string()),
  // A restore starts these projects again.
  running: z.array(z.string()),
  // Absent in a backup made before the settings could leave anything out.
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

// The platform learns that a backup exists and where, never the name of anything it holds.
export const BackupDeclarationSchema = z.object({
  id: BackupIdSchema,
  created_at: InstantSchema,
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

export const PlatformBackupSchema = BackupDeclarationSchema.extend({
  // Null once that server is gone.
  server_id: z.string().nullable(),
  server_name: z.string(),
})

export type PlatformBackup = z.infer<typeof PlatformBackupSchema>

export const BackupBeatSchema = z.object({
  interval_hours: BackupIntervalSchema,
  last_run_at: InstantSchema.optional(),
  last_ok_at: InstantSchema.optional(),
  last_error: z.string().max(500).optional(),
  // Parts the last backup could not carry: the alerts treat an incomplete backup as a failure.
  last_warnings: z.int().nonnegative().optional(),
})

export type BackupBeat = z.infer<typeof BackupBeatSchema>

// Late once two intervals have gone by without a success.
export function backupStaleAfterHours(intervalHours: number): number | null {
  return intervalHours > 0 ? intervalHours * 2 : null
}
