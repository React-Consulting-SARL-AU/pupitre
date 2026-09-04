import { z } from "zod"
import { ProtocolVersionSchema } from "./envelope"

export const EmptyParamsSchema = z.strictObject({})

export type EmptyParams = z.infer<typeof EmptyParamsSchema>

export const ENTITLEMENTS = ["valid", "grace", "restricted", "dev"] as const

export const EntitlementSchema = z.enum(ENTITLEMENTS)

export type Entitlement = z.infer<typeof EntitlementSchema>

export const HelloParamsSchema = z.strictObject({
  app_version: z.string().min(1),
  protocol: ProtocolVersionSchema,
})

export type HelloParams = z.infer<typeof HelloParamsSchema>

export const HelloResultSchema = z.object({
  agent_version: z.string().min(1),
  protocol: ProtocolVersionSchema,
  server_id: z.string().optional(),
  entitlement: EntitlementSchema,
  capabilities: z.array(z.string()),
})

export type HelloResult = z.infer<typeof HelloResultSchema>

export const PingResultSchema = z.object({
  ts: z.string(),
})

export type PingResult = z.infer<typeof PingResultSchema>
