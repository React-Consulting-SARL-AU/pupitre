import { z } from "zod"
import { FieldProblemSchema } from "../catalog/validate"
import { PortSchema } from "./ports"

export const PROTOCOL_ERROR_CODES = [
  "hello_required",
  "protocol_mismatch",
  "bad_request",
  "invalid_config",
  "unknown_command",
  "entitlement_required",
  "project_not_found",
  "module_not_found",
  "no_report",
  "service_not_found",
  "bad_signature",
  "downgrade_refused",
  "migration_required",
  "busy",
  "storage_refused",
  "backup_missing",
  "backup_unsupported",
  "backup_corrupt",
  "privilege_required",
  "internal",
] as const

export const ProtocolErrorCodeSchema = z.enum(PROTOCOL_ERROR_CODES)

export type ProtocolErrorCode = z.infer<typeof ProtocolErrorCodeSchema>

const PortTakenRemedySchema = z.object({
  code: z.literal("port_taken"),
  port_free: PortSchema,
})

const InvalidFieldsRemedySchema = z.object({
  code: z.literal("invalid_fields"),
  problems: z.array(FieldProblemSchema),
})

// The machine-readable half of a `fix`.
export const RemedySchema = z.discriminatedUnion("code", [
  PortTakenRemedySchema,
  InvalidFieldsRemedySchema,
])

export type Remedy = z.infer<typeof RemedySchema>

export const ProtocolErrorSchema = z.object({
  code: ProtocolErrorCodeSchema,
  message: z.string(),
  fix: z.string().optional(),
  remedy: RemedySchema.optional(),
})

export type ProtocolError = z.infer<typeof ProtocolErrorSchema>
