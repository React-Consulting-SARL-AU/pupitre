import { z } from "zod"
import { LocaleSchema } from "../i18n/locale"
import { ProtocolVersionSchema } from "./envelope"
import { ConfigRevisionSchema } from "./migrate"

export const EmptyParamsSchema = z.strictObject({})

const ENTITLEMENTS = ["valid", "grace", "restricted", "dev"] as const

export const EntitlementSchema = z.enum(ENTITLEMENTS)

export type Entitlement = z.infer<typeof EntitlementSchema>

export const HelloParamsSchema = z.strictObject({
  app_version: z.string().min(1),
  protocol: ProtocolVersionSchema,
  // The agent writes every sentence the app shows; one that lacks this language answers in its own.
  locale: LocaleSchema.optional(),
})

export const HelloResultSchema = z.object({
  agent_version: z.string().min(1),
  protocol: ProtocolVersionSchema,
  server_id: z.string().optional(),
  entitlement: EntitlementSchema,
  capabilities: z.array(z.string()),
  // Absent from an agent older than the ledger, whose configuration is current by definition.
  config: ConfigRevisionSchema.optional(),
})

export type HelloResult = z.infer<typeof HelloResultSchema>

export const PingResultSchema = z.object({
  ts: z.string(),
})
