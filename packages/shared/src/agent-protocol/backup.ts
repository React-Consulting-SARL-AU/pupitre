import { z } from "zod"
import {
  BackupDatabaseEngineSchema,
  BackupIdSchema,
  BackupIntervalSchema,
  BackupLocationSchema,
  BackupManifestSchema,
  BackupNameSchema,
  BackupPartSchema,
  BackupProjectModeSchema,
} from "../backup"

/** `warnings` are the sentences of the parts the last backup could not carry; `ok` stays true, since the backup exists. */
export const BackupLastRunSchema = z.object({
  at: z.string(),
  ok: z.boolean(),
  id: BackupIdSchema.optional(),
  bytes: z.int().nonnegative().optional(),
  error: z.string().optional(),
  warnings: z.array(z.string()).optional(),
})

export type BackupLastRun = z.infer<typeof BackupLastRunSchema>

/**
 * Where backups stand on this server. `configured` is false until `core.backup`
 * is installed and configured; `running` is true while a backup holds the lock,
 * whoever started it.
 */
export const BackupStatusResultSchema = z.object({
  configured: z.boolean(),
  interval_hours: BackupIntervalSchema,
  keep: z.int().nonnegative(),
  next_run_at: z.string().optional(),
  running: z.boolean(),
  last: BackupLastRunSchema.optional(),
})

export type BackupStatusResult = z.infer<typeof BackupStatusResultSchema>

export const BackupContentProjectSchema = z.object({
  name: z.string(),
  /** Whether the project has a repository: without one, it is always carried whole. */
  repo: z.boolean(),
  included: z.boolean(),
})

export const BackupContentDatabaseSchema = z.object({
  engine: BackupDatabaseEngineSchema,
  /** `*` for the Redis snapshot. */
  name: z.string(),
  /** The settings' name for it: `postgres:shop`, `redis:*`. */
  item: z.string(),
  included: z.boolean(),
})

/**
 * What this server holds that a backup can carry, each with whether the
 * settings carry it now: the checklist the app draws. A database engine that
 * does not answer is named in `unreadable` rather than failing the whole list.
 */
export const BackupContentsResultSchema = z.object({
  projects: z.array(BackupContentProjectSchema),
  databases: z.array(BackupContentDatabaseSchema),
  unreadable: z.array(BackupDatabaseEngineSchema),
})

export type BackupContentsResult = z.infer<typeof BackupContentsResultSchema>

/** A backup now, named or not, departing from the module's settings for this one run only. */
export const BackupRunParamsSchema = z.strictObject({
  name: BackupNameSchema.optional(),
  databases: z.boolean().optional(),
  projects: BackupProjectModeSchema.optional(),
})

export type BackupRunParams = z.infer<typeof BackupRunParamsSchema>

/**
 * `declared` is false when the platform did not answer: the backup exists in
 * the bucket all the same, and the daemon declares it again at its next turn.
 */
export const BackupRunResultSchema = z.object({
  id: BackupIdSchema,
  key: z.string(),
  bytes: z.int().nonnegative(),
  parts: z.array(BackupPartSchema),
  warnings: z.array(z.string()),
  declared: z.boolean(),
})

export type BackupRunResult = z.infer<typeof BackupRunResultSchema>

export const BackupDeleteParamsSchema = z.strictObject({
  id: BackupIdSchema,
})

export type BackupDeleteParams = z.infer<typeof BackupDeleteParamsSchema>

export const BackupDeleteResultSchema = z.object({
  deleted: z.boolean(),
})

export type BackupDeleteResult = z.infer<typeof BackupDeleteResultSchema>

export const BackupInspectParamsSchema = z.strictObject({
  location: BackupLocationSchema,
  secrets_stdin: z.literal(true),
})

export type BackupInspectParams = z.infer<typeof BackupInspectParamsSchema>

export const BackupInspectResultSchema = BackupManifestSchema

export type BackupInspectResult = z.infer<typeof BackupInspectResultSchema>

/**
 * The secret line of a command that reads a bucket. The access key travels
 * here too: it is half of a credential, and nothing of a credential belongs in
 * `params`. `private_key` is the X25519 scalar the laptop derived from the
 * passphrase, standard base64; only a restore sends it, it is used in memory
 * and never written.
 */
export const BackupSecretsSchema = z.strictObject({
  access_key_id: z.string().min(1),
  secret_access_key: z.string().min(1),
  private_key: z.string().length(44).optional(),
})

export type BackupSecrets = z.infer<typeof BackupSecretsSchema>

/**
 * A fresh machine takes a backup's configuration as its first one. A machine
 * already installed takes it only with `revert`: the server goes back to what
 * the backup holds. Its projects are stopped first, the registry and the
 * modules' configuration are replaced, and the projects the backup does not
 * know leave the registry — their folders stay where they are.
 */
export const BackupRestoreSetupParamsSchema = z.strictObject({
  location: BackupLocationSchema,
  revert: z.boolean().optional(),
  secrets_stdin: z.literal(true),
})

export type BackupRestoreSetupParams = z.infer<
  typeof BackupRestoreSetupParamsSchema
>

/**
 * The machine's configuration as the backup left it, migrated to the revision
 * this binary reads and put in place. `modules` and `defer` are what the next
 * `install` names; `module.config` gives each one's values. `extra` names the
 * modules installed here that the backup does not hold, which a revert offers
 * to uninstall; `dropped` the projects that left the registry. `parts` are the
 * data parts `backup.restore.data` can bring back once the modules are there.
 */
export const BackupRestoreSetupResultSchema = z.object({
  id: BackupIdSchema,
  modules: z.array(z.string()),
  defer: z.array(z.string()),
  extra: z.array(z.string()),
  projects: z.array(z.string()),
  dropped: z.array(z.string()),
  parts: z.array(BackupPartSchema),
  warnings: z.array(z.string()),
})

export type BackupRestoreSetupResult = z.infer<
  typeof BackupRestoreSetupResultSchema
>

/**
 * `parts` names data parts by their object key. Each one comes back exactly as
 * the backup holds it: a database is dropped and recreated before its import, a
 * project's folder or an extra path is replaced whole. `start` puts running
 * again the projects the manifest records as running, after their dependencies
 * are installed; it is what "the projects run as they did" means, and the
 * default.
 */
export const BackupRestoreDataParamsSchema = z.strictObject({
  location: BackupLocationSchema,
  parts: z.array(z.string().min(1)).min(1),
  start: z.boolean().optional(),
  secrets_stdin: z.literal(true),
})

export type BackupRestoreDataParams = z.infer<
  typeof BackupRestoreDataParamsSchema
>

export const BackupRestoreDataResultSchema = z.object({
  restored: z.array(z.string()),
  failed: z.array(z.string()),
  started: z.array(z.string()),
  warnings: z.array(z.string()),
})

export type BackupRestoreDataResult = z.infer<
  typeof BackupRestoreDataResultSchema
>
