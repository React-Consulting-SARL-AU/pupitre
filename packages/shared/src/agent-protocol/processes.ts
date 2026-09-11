import { z } from "zod"
import { RequestIdSchema } from "./envelope"
import { ProjectNameSchema, SessionSchema } from "./state"

export const AGENT_KINDS = ["claude", "codex", "hermes"] as const

export const AgentKindSchema = z.enum(AGENT_KINDS)

export type AgentKind = z.infer<typeof AgentKindSchema>

export const AgentOpenParamsSchema = z.strictObject({
  kind: AgentKindSchema,
  project: ProjectNameSchema,
})

export type AgentOpenParams = z.infer<typeof AgentOpenParamsSchema>

export const AgentOpenResultSchema = z.object({
  command: z.string(),
  session: z.string(),
})

export type AgentOpenResult = z.infer<typeof AgentOpenResultSchema>

export const SessionsListResultSchema = z.object({
  sessions: z.array(SessionSchema),
})

export type SessionsListResult = z.infer<typeof SessionsListResultSchema>

export const SessionsCleanResultSchema = z.object({
  killed: z.int().nonnegative(),
})

export type SessionsCleanResult = z.infer<typeof SessionsCleanResultSchema>

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

export type ProcessKillParams = z.infer<typeof ProcessKillParamsSchema>

export const ShotSchema = z.object({
  name: z.string(),
  path: z.string(),
  size_bytes: z.int().nonnegative(),
  created_at: z.string(),
})

export type Shot = z.infer<typeof ShotSchema>

export const ShotsListResultSchema = z.object({
  shots: z.array(ShotSchema),
})

export type ShotsListResult = z.infer<typeof ShotsListResultSchema>

export const ShotsUrlResultSchema = z.object({
  url: z.string(),
})

export type ShotsUrlResult = z.infer<typeof ShotsUrlResultSchema>

/**
 * Without a path, the gallery is swept of what is older than it keeps. With
 * one, that single capture goes — and the path is looked up in what
 * `shots.list` names, never resolved on the disk, exactly as `shots.read`.
 */
export const ShotsCleanParamsSchema = z.strictObject({
  path: z.string().min(1).optional(),
})

export type ShotsCleanParams = z.infer<typeof ShotsCleanParamsSchema>

export const ShotsCleanResultSchema = z.object({
  removed: z.int().nonnegative(),
})

export type ShotsCleanResult = z.infer<typeof ShotsCleanResultSchema>

export const SHOT_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
] as const

export const ShotMediaTypeSchema = z.enum(SHOT_MEDIA_TYPES)

export type ShotMediaType = z.infer<typeof ShotMediaTypeSchema>

export const SHOT_CHUNK_BYTES = 48 * 1024

export const SHOT_MAX_BYTES = 16 * 1024 * 1024

export const ShotsReadParamsSchema = z.strictObject({
  path: z.string().min(1),
})

export type ShotsReadParams = z.infer<typeof ShotsReadParamsSchema>

export const ShotsReadResultSchema = z.object({
  path: z.string(),
  media_type: ShotMediaTypeSchema,
  size_bytes: z.int().nonnegative().max(SHOT_MAX_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  chunks: z.int().nonnegative(),
})

export type ShotsReadResult = z.infer<typeof ShotsReadResultSchema>

export const ShotEventSchema = z.object({
  id: RequestIdSchema,
  event: z.literal("shot"),
  seq: z.int().nonnegative(),
  bytes: z.string(),
})

export type ShotEvent = z.infer<typeof ShotEventSchema>
