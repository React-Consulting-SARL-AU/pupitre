import { z } from "zod"

export const PROTOCOL_ERROR_CODES = [
  "hello_required",
  "protocol_mismatch",
  "bad_request",
  "unknown_command",
  "entitlement_required",
  "project_not_found",
  "module_not_found",
  "module_failed",
  "service_not_found",
  "secrets_required",
  "bad_signature",
  "busy",
  "internal",
] as const

export const ProtocolErrorCodeSchema = z.enum(PROTOCOL_ERROR_CODES)

export type ProtocolErrorCode = z.infer<typeof ProtocolErrorCodeSchema>

export const ProtocolErrorSchema = z.object({
  code: ProtocolErrorCodeSchema,
  message: z.string(),
  fix: z.string().optional(),
})

export type ProtocolError = z.infer<typeof ProtocolErrorSchema>
