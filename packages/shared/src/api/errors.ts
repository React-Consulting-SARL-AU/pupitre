import { z } from "zod"

export const API_ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "no_active_organization",
  "not_found",
  "validation",
  "conflict",
  "rate_limited",
  "enrollment_used",
  "enrollment_expired",
  "seat_quota_reached",
  "key_not_ed25519",
  "device_exists",
  "invalid_server_token",
  "entitlement_required",
  "server_suspended",
  "release_not_found",
  "app_release_not_found",
  "stripe_signature_invalid",
  "key_approval_invalid",
  "reauthentication_required",
  "server_repair_forbidden",
  "host_key_mismatch",
  "internal",
] as const

export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES)

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    fix: z.string().optional(),
  }),
})

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return ApiErrorBodySchema.safeParse(value).success
}

export class ApiError extends Error {
  readonly body: unknown
  readonly status: number

  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.name = "ApiError"
    this.body = body
    this.status = status
  }
}
