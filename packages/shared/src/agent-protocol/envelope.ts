import { z } from "zod"
import { ProtocolErrorSchema } from "./errors"

export const PROTOCOL_VERSION = 1

export const ProtocolVersionSchema = z.int().positive()

export const RequestIdSchema = z.int().nonnegative()

export const RequestSchema = z.object({
  id: RequestIdSchema,
  cmd: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
})

export type Request = z.infer<typeof RequestSchema>

export const EventSchema = z.looseObject({
  id: RequestIdSchema,
  event: z.string().min(1),
})

export type Event = z.infer<typeof EventSchema>

export const LogEventSchema = z.object({
  id: RequestIdSchema,
  event: z.literal("log"),
  line: z.string(),
})

export type LogEvent = z.infer<typeof LogEventSchema>

export const STEP_STATUSES = ["start", "ok", "skip", "fail"] as const

export const StepStatusSchema = z.enum(STEP_STATUSES)

export type StepStatus = z.infer<typeof StepStatusSchema>

export const StepEventSchema = z.object({
  id: RequestIdSchema,
  event: z.literal("step"),
  module: z.string(),
  step: z.string(),
  status: StepStatusSchema,
  ms: z.int().nonnegative(),
  replay: z.string().optional(),
})

export type StepEvent = z.infer<typeof StepEventSchema>

export const SuccessResponseSchema = z.object({
  id: RequestIdSchema,
  ok: z.literal(true),
  result: z.unknown(),
})

export type SuccessResponse = z.infer<typeof SuccessResponseSchema>

export const FailureResponseSchema = z.object({
  id: RequestIdSchema,
  ok: z.literal(false),
  error: ProtocolErrorSchema,
})

export type FailureResponse = z.infer<typeof FailureResponseSchema>

export const ResponseSchema = z.discriminatedUnion("ok", [
  SuccessResponseSchema,
  FailureResponseSchema,
])

export type Response = z.infer<typeof ResponseSchema>
