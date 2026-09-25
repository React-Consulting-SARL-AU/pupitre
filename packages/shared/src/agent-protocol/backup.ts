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

const BackupLastRunSchema = z.object({
  at: z.string(),
  // Stays true with warnings: the backup exists.
  ok: z.boolean(),
  id: BackupIdSchema.optional(),
  bytes: z.int().nonnegative().optional(),
  error: z.string().optional(),
  warnings: z.array(z.string()).optional(),
})

export const BackupStatusResultSchema = z.object({
  configured: z.boolean(),
  interval_hours: BackupIntervalSchema,
  keep: z.int().nonnegative(),
  next_run_at: z.string().optional(),
  // While a backup holds the lock, whoever started it.
  running: z.boolean(),
  last: BackupLastRunSchema.optional(),
})

export type BackupStatusResult = z.infer<typeof BackupStatusResultSchema>

const BackupContentProjectSchema = z.object({
  name: z.string(),
  // Without a repository, a project is always carried whole.
  repo: z.boolean(),
  included: z.boolean(),
})

const BackupContentDatabaseSchema = z.object({
  engine: BackupDatabaseEngineSchema,
  // `*` for the Redis snapshot.
  name: z.string(),
  item: z.string(),
  included: z.boolean(),
})

export const BackupContentsResultSchema = z.object({
  projects: z.array(BackupContentProjectSchema),
  databases: z.array(BackupContentDatabaseSchema),
  // An engine that does not answer is named here rather than failing the whole list.
  unreadable: z.array(BackupDatabaseEngineSchema),
})

export type BackupContentsResult = z.infer<typeof BackupContentsResultSchema>

// Departs from the module's settings for this one run only.
export const BackupRunParamsSchema = z.strictObject({
  name: BackupNameSchema.optional(),
  databases: z.boolean().optional(),
  projects: BackupProjectModeSchema.optional(),
})

export const BackupRunResultSchema = z.object({
  id: BackupIdSchema,
  key: z.string(),
  bytes: z.int().nonnegative(),
  parts: z.array(BackupPartSchema),
  warnings: z.array(z.string()),
  // False when the platform did not answer: the daemon declares the backup again at its next turn.
  declared: z.boolean(),
})

export type BackupRunResult = z.infer<typeof BackupRunResultSchema>

export const BackupDeleteParamsSchema = z.strictObject({
  id: BackupIdSchema,
})

export const BackupDeleteResultSchema = z.object({
  deleted: z.boolean(),
})

export const BackupInspectParamsSchema = z.strictObject({
  location: BackupLocationSchema,
  secrets_stdin: z.literal(true),
})

export const BackupInspectResultSchema = BackupManifestSchema

export const BackupSecretsSchema = z.strictObject({
  // Half of a credential, and nothing of a credential belongs in `params`.
  access_key_id: z.string().min(1),
  secret_access_key: z.string().min(1),
  // Derived on the laptop from the passphrase; only a restore sends it, and it is never written.
  private_key: z.string().length(44).optional(),
})

export type BackupSecrets = z.infer<typeof BackupSecretsSchema>

export const BackupRestoreSetupParamsSchema = z.strictObject({
  location: BackupLocationSchema,
  // Required on an installed machine: its projects stop and its registry and configuration are replaced.
  revert: z.boolean().optional(),
  secrets_stdin: z.literal(true),
})

export const BackupRestoreSetupResultSchema = z.object({
  id: BackupIdSchema,
  modules: z.array(z.string()),
  defer: z.array(z.string()),
  // Installed here but absent from the backup: what a revert offers to uninstall.
  extra: z.array(z.string()),
  projects: z.array(z.string()),
  dropped: z.array(z.string()),
  parts: z.array(BackupPartSchema),
  warnings: z.array(z.string()),
})

export type BackupRestoreSetupResult = z.infer<
  typeof BackupRestoreSetupResultSchema
>

export const BackupRestoreDataParamsSchema = z.strictObject({
  location: BackupLocationSchema,
  // Each comes back exactly: a database is dropped and recreated, a folder replaced whole.
  parts: z.array(z.string().min(1)).min(1),
  // Defaults to true: the projects the manifest records as running start again.
  start: z.boolean().optional(),
  secrets_stdin: z.literal(true),
})

export const BackupRestoreDataResultSchema = z.object({
  restored: z.array(z.string()),
  failed: z.array(z.string()),
  started: z.array(z.string()),
  warnings: z.array(z.string()),
})

export type BackupRestoreDataResult = z.infer<
  typeof BackupRestoreDataResultSchema
>
