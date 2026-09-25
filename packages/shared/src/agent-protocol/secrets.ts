import { z } from "zod"
import { RequestIdSchema } from "./envelope"
import { ProjectEnvResultSchema } from "./projects"
import { ProcessIdSchema, ProjectNameSchema } from "./state"

export const SecretKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/)

export const ServiceSecretParamsSchema = z.strictObject({
  id: z.string().min(1),
  key: SecretKeySchema,
})

export const ServiceSecretResultSchema = z.object({
  key: SecretKeySchema,
})

export const SecretEventSchema = z.object({
  id: RequestIdSchema,
  event: z.literal("secret"),
  key: SecretKeySchema,
  value: z.string(),
})

export type SecretEvent = z.infer<typeof SecretEventSchema>

export const SecretsSyncParamsSchema = z.strictObject({
  project: ProjectNameSchema,
  process: ProcessIdSchema.optional(),
})

export const SecretsSyncResultSchema = ProjectEnvResultSchema

export const DB_ENGINES = ["mysql", "postgres", "mongodb"] as const

export const DbEngineSchema = z.enum(DB_ENGINES)

export type DbEngine = z.infer<typeof DbEngineSchema>

export const DbParamsSchema = z.strictObject({
  engine: DbEngineSchema,
  name: z.string().min(1).optional(),
})

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

export const DbUrlResultSchema = z.object({
  url: z.string(),
})

export const TUNNEL_STATES = ["running", "stopped", "failed", "absent"] as const

export const TunnelStateSchema = z.enum(TUNNEL_STATES)

export type TunnelState = z.infer<typeof TunnelStateSchema>

export const TunnelRouteSchema = z.object({
  hostname: z.string(),
  service: z.string(),
  project: z.string().optional(),
})

export type TunnelRoute = z.infer<typeof TunnelRouteSchema>

export const EXPOSURE_PROVIDERS = ["cloudflare", "caddy"] as const

export const ExposureProviderSchema = z.enum(EXPOSURE_PROVIDERS)

export type ExposureProvider = z.infer<typeof ExposureProviderSchema>

/** `provider` names the module that answered, and is null when none holds the machine. */
export const TunnelStatusResultSchema = z.object({
  provider: ExposureProviderSchema.nullable(),
  installed: z.boolean(),
  state: TunnelStateSchema,
  routes: z.array(TunnelRouteSchema),
})

export type TunnelStatusResult = z.infer<typeof TunnelStatusResultSchema>
