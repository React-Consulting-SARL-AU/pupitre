import { z } from "zod"
import { EntitlementSchema } from "./session"

export const DoneResultSchema = z.object({
  done: z.literal(true),
})

export type DoneResult = z.infer<typeof DoneResultSchema>

export const AuthorizedKeySchema = z.object({
  fingerprint: z.string(),
  comment: z.string().optional(),
  device_id: z.string().optional(),
})

export type AuthorizedKey = z.infer<typeof AuthorizedKeySchema>

export const KeysListResultSchema = z.object({
  keys: z.array(AuthorizedKeySchema),
  synced_at: z.string().optional(),
})

export type KeysListResult = z.infer<typeof KeysListResultSchema>

export const AgentUpgradeParamsSchema = z.strictObject({
  version: z.string().min(1).optional(),
  signature: z.string().min(1),
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
