import { z } from "zod"
import { RequestIdSchema } from "./envelope"
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

export const SecretsSetSecretsSchema = z
  .record(SecretKeySchema, z.string().min(1))
  .refine((values) => Object.keys(values).length === 1)

export type SecretsSetSecrets = z.infer<typeof SecretsSetSecretsSchema>

export const ServiceSecretParamsSchema = z.strictObject({
  id: z.string().min(1),
  key: SecretKeySchema,
})

export type ServiceSecretParams = z.infer<typeof ServiceSecretParamsSchema>

export const ServiceSecretResultSchema = z.object({
  key: SecretKeySchema,
})

export type ServiceSecretResult = z.infer<typeof ServiceSecretResultSchema>

export const SecretEventSchema = z.object({
  id: RequestIdSchema,
  event: z.literal("secret"),
  key: SecretKeySchema,
  value: z.string(),
})

export type SecretEvent = z.infer<typeof SecretEventSchema>

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

export const EXPOSURE_PROVIDERS = ["cloudflare", "caddy", "ssh"] as const

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
