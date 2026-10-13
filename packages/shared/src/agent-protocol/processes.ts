import { z } from "zod"
import { ProjectNameSchema, SessionSchema } from "./state"

export const AGENT_KINDS = [
  "claude",
  "codex",
  "cursor",
  "gemini",
  "copilot",
  "opencode",
  "hermes",
] as const

const AgentKindSchema = z.enum(AGENT_KINDS)

export type AgentKind = z.infer<typeof AgentKindSchema>

export const AgentOpenParamsSchema = z.strictObject({
  kind: AgentKindSchema,
  project: ProjectNameSchema,
})

export const AgentOpenResultSchema = z.object({
  command: z.string(),
  session: z.string(),
})

export const SessionsListResultSchema = z.object({
  sessions: z.array(SessionSchema),
})

export const SessionsCleanResultSchema = z.object({
  killed: z.int().nonnegative(),
})

export const ProcessSchema = z.object({
  pid: z.int().positive(),
  cpu: z.number().nonnegative(),
  ram_mb: z.int().nonnegative(),
  command: z.string(),
  project: z.string(),
})

export type Process = z.infer<typeof ProcessSchema>

export const ProcessesListResultSchema = z.object({
  processes: z.array(ProcessSchema),
})

export type ProcessesListResult = z.infer<typeof ProcessesListResultSchema>

export const ProcessKillParamsSchema = z.strictObject({
  pid: z.int().positive(),
  force: z.boolean().optional(),
})
