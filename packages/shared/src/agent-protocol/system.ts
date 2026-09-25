import { z } from "zod"
import { ApprovedKeySchema, KeyFingerprintSchema } from "../keys"
import { EntitlementSchema } from "./session"

export const DoneResultSchema = z.object({
  done: z.literal(true),
})

export type DoneResult = z.infer<typeof DoneResultSchema>

export const AuthorizedKeySchema = z.object({
  fingerprint: z.string(),
  comment: z.string().optional(),
  device_id: z.string().optional(),
  signer: z.boolean().optional(),
})

export type AuthorizedKey = z.infer<typeof AuthorizedKeySchema>

/** `pending` names the keys the platform asked for that no valid approval covers yet. */
export const KeysListResultSchema = z.object({
  keys: z.array(AuthorizedKeySchema),
  pending: z.array(KeyFingerprintSchema).optional(),
  synced_at: z.string().optional(),
})

export type KeysListResult = z.infer<typeof KeysListResultSchema>

/**
 * A key the app installs over its own SSH session becomes a signer: the root
 * of trust is laid by SSH, never by the platform. It enters the managed block
 * at once, and stays there as long as the platform still asks for it.
 */
export const KeysTrustParamsSchema = z.strictObject({
  public_key: ApprovedKeySchema,
})

export type KeysTrustParams = z.infer<typeof KeysTrustParamsSchema>

/**
 * The platform, told now rather than at the next turn of the daemon.
 *
 * The app asks for it when an installation or a hardening has just changed the
 * machine, so the console shows the modules instead of an empty server for the
 * next five minutes. It reads and reports; it changes nothing on the machine.
 */
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

export type AgentUpgradeParams = z.infer<typeof AgentUpgradeParamsSchema>

export const AgentUpgradeResultSchema = z.object({
  previous_version: z.string(),
  version: z.string(),
  restarting: z.boolean(),
})

export type AgentUpgradeResult = z.infer<typeof AgentUpgradeResultSchema>

export const DoctorCheckSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  message: z.string().optional(),
  fix: z.string().optional(),
})

export type DoctorCheck = z.infer<typeof DoctorCheckSchema>

export const DoctorResultSchema = z.object({
  checks: z.array(DoctorCheckSchema),
})

export type DoctorResult = z.infer<typeof DoctorResultSchema>

export const DiagResultSchema = z.object({
  generated_at: z.string(),
  report: z.string(),
})

export type DiagResult = z.infer<typeof DiagResultSchema>

export const EnrollParamsSchema = z.strictObject({
  platform_url: z.url(),
  secrets_stdin: z.literal(true),
})

export type EnrollParams = z.infer<typeof EnrollParamsSchema>

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
