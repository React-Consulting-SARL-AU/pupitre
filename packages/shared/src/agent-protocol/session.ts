import { z } from "zod"
import { LocaleSchema } from "../i18n/locale"
import { ProtocolVersionSchema } from "./envelope"

export const EmptyParamsSchema = z.strictObject({})

export type EmptyParams = z.infer<typeof EmptyParamsSchema>

export const ENTITLEMENTS = ["valid", "grace", "restricted", "dev"] as const

export const EntitlementSchema = z.enum(ENTITLEMENTS)

export type Entitlement = z.infer<typeof EntitlementSchema>

/**
 * The app's language travels with the handshake.
 *
 * Everything the server sends back — messages, remedies, probe reasons,
 * catalogue labels — is written into the agent binary, and the app displays
 * it as is. Without this tag, an English app would show French sentences. An
 * agent that doesn't know the requested language answers in its own: never
 * an error, never an empty field.
 */
export const HelloParamsSchema = z.strictObject({
  app_version: z.string().min(1),
  protocol: ProtocolVersionSchema,
  locale: LocaleSchema.optional(),
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
