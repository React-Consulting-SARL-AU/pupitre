import { z } from "zod"
import { ProjectEnvResultSchema } from "./projects"
import { ProjectNameSchema } from "./state"

export const SecretKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/)

export const SecretStatusSchema = z.strictObject({
  key: SecretKeySchema,
  set: z.boolean(),
})

export type SecretStatus = z.infer<typeof SecretStatusSchema>

export const SecretsStatusResultSchema = z.object({
  secrets: z.array(SecretStatusSchema),
})

export type SecretsStatusResult = z.infer<typeof SecretsStatusResultSchema>

export const SecretsSetParamsSchema = z.strictObject({
  key: SecretKeySchema,
  secrets_stdin: z.literal(true),
})

export type SecretsSetParams = z.infer<typeof SecretsSetParamsSchema>

export const SecretsSyncParamsSchema = z.strictObject({
  project: ProjectNameSchema,
})

export type SecretsSyncParams = z.infer<typeof SecretsSyncParamsSchema>

export const SecretsSyncResultSchema = ProjectEnvResultSchema

export type SecretsSyncResult = z.infer<typeof SecretsSyncResultSchema>

export const DB_ENGINES = ["mysql", "postgres", "mongodb"] as const

export const DbEngineSchema = z.enum(DB_ENGINES)

export type DbEngine = z.infer<typeof DbEngineSchema>

export const DbParamsSchema = z.strictObject({
  engine: DbEngineSchema,
  name: z.string().min(1).optional(),
})

export type DbParams = z.infer<typeof DbParamsSchema>

export const DbDumpResultSchema = z.object({
  path: z.string(),
  size_bytes: z.int().nonnegative(),
})

export type DbDumpResult = z.infer<typeof DbDumpResultSchema>

export const DbImportResultSchema = z.object({
  imported: z.array(z.string()),
})

export type DbImportResult = z.infer<typeof DbImportResultSchema>

export const DbShellResultSchema = z.object({
  command: z.string(),
})

export type DbShellResult = z.infer<typeof DbShellResultSchema>

export const DbUrlResultSchema = z.object({
  url: z.string(),
})

export type DbUrlResult = z.infer<typeof DbUrlResultSchema>

export const TUNNEL_STATES = ["running", "stopped", "failed", "absent"] as const

export const TunnelStateSchema = z.enum(TUNNEL_STATES)

export type TunnelState = z.infer<typeof TunnelStateSchema>

export const TunnelRouteSchema = z.object({
  hostname: z.string(),
  service: z.string(),
  project: z.string().optional(),
})

export type TunnelRoute = z.infer<typeof TunnelRouteSchema>

export const TunnelStatusResultSchema = z.object({
  installed: z.boolean(),
  state: TunnelStateSchema,
  routes: z.array(TunnelRouteSchema),
})

export type TunnelStatusResult = z.infer<typeof TunnelStatusResultSchema>
