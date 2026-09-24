import {
  BACKUP_BUCKET_PATTERN,
  BACKUP_ENDPOINT_PATTERN,
  BACKUP_ID_PATTERN,
  BACKUP_INTERVAL_MAX_HOURS,
  BACKUP_REGION_PATTERN,
  BACKUP_TRIGGERS,
} from "@pupitre/shared/backup"
import { t } from "elysia"
import { dateTime } from "../../openapi-models"

const BASE64_PATTERN = "^[A-Za-z0-9+/]+={0,2}$"

const SHA256_PATTERN = "^[0-9a-f]{64}$"

export const backupIdSchema = t.String({ pattern: BACKUP_ID_PATTERN })

export const backupTriggerSchema = t.UnionEnum([...BACKUP_TRIGGERS])

export const backupCountsSchema = t.Object(
  {
    setup: t.Boolean(),
    home: t.Boolean(),
    databases: t.Integer({ minimum: 0 }),
    projects: t.Integer({ minimum: 0 }),
    paths: t.Integer({ minimum: 0 }),
  },
  { $id: "BackupCounts" }
)

const locationFields = {
  endpoint: t.String({ pattern: BACKUP_ENDPOINT_PATTERN }),
  region: t.String({ pattern: BACKUP_REGION_PATTERN }),
  bucket: t.String({ pattern: BACKUP_BUCKET_PATTERN }),
  key: t.String({ minLength: 1, maxLength: 512 }),
  path_style: t.Boolean(),
  sha256: t.String({ pattern: SHA256_PATTERN }),
}

const recipientSchema = t.String({
  pattern: BASE64_PATTERN,
  minLength: 44,
  maxLength: 44,
})

const saltSchema = t.String({
  pattern: BASE64_PATTERN,
  minLength: 24,
  maxLength: 24,
})

export const backupDeclarationBody = t.Object({
  id: backupIdSchema,
  created_at: dateTime,
  trigger: backupTriggerSchema,
  bytes: t.Integer({ minimum: 0 }),
  counts: backupCountsSchema,
  config_revision: t.Integer({ minimum: 0 }),
  agent_version: t.String({ minLength: 1 }),
  recipient: recipientSchema,
  kdf_salt: saltSchema,
  location: t.Object(locationFields, { additionalProperties: false }),
})

export const backupSchema = t.Object(
  {
    id: t.String(),
    server_id: t.Nullable(t.String()),
    server_name: t.String(),
    created_at: dateTime,
    trigger: backupTriggerSchema,
    bytes: t.Integer(),
    counts: backupCountsSchema,
    config_revision: t.Integer(),
    agent_version: t.String(),
    recipient: t.String(),
    kdf_salt: t.String(),
    location: t.Object(locationFields, { $id: "BackupLocation" }),
  },
  { $id: "Backup" }
)

export const backupBeatSchema = t.Object(
  {
    interval_hours: t.Integer({
      minimum: 0,
      maximum: BACKUP_INTERVAL_MAX_HOURS,
    }),
    last_run_at: t.Optional(dateTime),
    last_ok_at: t.Optional(dateTime),
    last_error: t.Optional(t.String({ maxLength: 500 })),
    last_warnings: t.Optional(t.Integer({ minimum: 0 })),
  },
  { $id: "BackupBeat" }
)

export const restoredBody = t.Object({
  server_id: t.String({ minLength: 1 }),
})
