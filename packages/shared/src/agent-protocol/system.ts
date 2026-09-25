import { z } from "zod"
import { ApprovedKeySchema, KeyFingerprintSchema } from "../keys"
import { EntitlementSchema } from "./session"

export const DoneResultSchema = z.object({
  done: z.literal(true),
})

const AuthorizedKeySchema = z.object({
  fingerprint: z.string(),
  comment: z.string().optional(),
  device_id: z.string().optional(),
  signer: z.boolean().optional(),
})

export const KeysListResultSchema = z.object({
  keys: z.array(AuthorizedKeySchema),
  // Keys the platform asked for that no valid approval covers yet.
  pending: z.array(KeyFingerprintSchema).optional(),
  synced_at: z.string().optional(),
})

export type KeysListResult = z.infer<typeof KeysListResultSchema>

// The key becomes a signer: the root of trust is laid over SSH, never by the platform.
export const KeysTrustParamsSchema = z.strictObject({
  public_key: ApprovedKeySchema,
})

export const PlatformSyncResultSchema = z.object({
  synced_at: z.string(),
  heartbeat_at: z.string().optional(),
})

export type PlatformSyncResult = z.infer<typeof PlatformSyncResultSchema>

export const AgentUpgradeParamsSchema = z.strictObject({
  version: z.string().min(1).optional(),
  signature: z.string().min(1).optional(),
  allow_downgrade: z.boolean().optional(),
})

export const AgentUpgradeResultSchema = z.object({
  previous_version: z.string(),
  version: z.string(),
  restarting: z.boolean(),
})

export type AgentUpgradeResult = z.infer<typeof AgentUpgradeResultSchema>

const DoctorCheckSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  message: z.string().optional(),
  fix: z.string().optional(),
})

export const DoctorResultSchema = z.object({
  checks: z.array(DoctorCheckSchema),
})

export const DiagResultSchema = z.object({
  generated_at: z.string(),
  report: z.string(),
})

export const EnrollParamsSchema = z.strictObject({
  platform_url: z.url(),
  secrets_stdin: z.literal(true),
})

export const EnrollSecretsSchema = z.strictObject({
  enrollment_token: z.string().min(1),
})

export type EnrollSecrets = z.infer<typeof EnrollSecretsSchema>

export const EnrollResultSchema = z.object({
  enrolled: z.literal(true),
  entitlement: EntitlementSchema,
  synced_at: z.string().optional(),
})

export type EnrollResult = z.infer<typeof EnrollResultSchema>
