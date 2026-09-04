import { z } from "zod"
import { PortSchema } from "./ports"

export const PROTOCOL_ERROR_CODES = [
  "hello_required",
  "protocol_mismatch",
  "bad_request",
  "unknown_command",
  "entitlement_required",
  "project_not_found",
  "module_not_found",
  "module_failed",
  "no_report",
  "service_not_found",
  "secrets_required",
  "bad_signature",
  "busy",
  "internal",
] as const

export const ProtocolErrorCodeSchema = z.enum(PROTOCOL_ERROR_CODES)

export type ProtocolErrorCode = z.infer<typeof ProtocolErrorCodeSchema>

export const REMEDY_CODES = ["port_taken"] as const

export const RemedyCodeSchema = z.enum(REMEDY_CODES)

export type RemedyCode = z.infer<typeof RemedyCodeSchema>

export const PortTakenRemedySchema = z.object({
  code: z.literal("port_taken"),
  port_free: PortSchema,
})

export type PortTakenRemedy = z.infer<typeof PortTakenRemedySchema>

/** The machine-readable half of a `fix`: what to do next, as a value. */
export const RemedySchema = z.discriminatedUnion("code", [
  PortTakenRemedySchema,
])

export type Remedy = z.infer<typeof RemedySchema>

export const ProtocolErrorSchema = z.object({
  code: ProtocolErrorCodeSchema,
  message: z.string(),
  fix: z.string().optional(),
  remedy: RemedySchema.optional(),
})

export type ProtocolError = z.infer<typeof ProtocolErrorSchema>
