import { z } from "zod"
import { ProjectNameSchema } from "./state"

export const ACCESS_KEY_PREFIX = "ppk_"

export const ACCESS_KEY_ID_LENGTH = 12

export const ACCESS_KEY_SECRET_LENGTH = 32

export const ACCESS_KEY_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

// Named so they never meet a site's own Authorization header, session cookie or query.
export const ACCESS_HEADER = "Pupitre-Key"

export const ACCESS_QUERY = "pupitre_key"

export const ACCESS_COOKIE = "__Host-pupitre"

export const ACCESS_IDENTITY_HEADER = "Pupitre-Identity"

// The gate answers under it on a protected name, before the site.
export const ACCESS_RESERVED_PATH = "/.pupitre/"

export const ACCESS_KEY_PATTERN = new RegExp(
  `^${ACCESS_KEY_PREFIX}([a-z0-9]{${ACCESS_KEY_ID_LENGTH}})_[a-z0-9]{${ACCESS_KEY_SECRET_LENGTH}}$`
)

export const AccessKeyIdSchema = z
  .string()
  .regex(new RegExp(`^[a-z0-9]{${ACCESS_KEY_ID_LENGTH}}$`))

// SHA-256 of the whole key: the server never holds the key itself.
export const AccessKeyHashSchema = z.string().regex(/^[0-9a-f]{64}$/)

export const ACCESS_KEY_NAME_MAX = 80

export const AccessKeyNameSchema = z
  .string()
  .min(1)
  .max(ACCESS_KEY_NAME_MAX)
  .refine((name) => name.trim() === name, "a key name has no outer spaces")

// Null opens every project of the server, those added later included.
export const AccessScopeSchema = z
  .array(ProjectNameSchema)
  .min(1)
  .refine(
    (projects) => new Set(projects).size === projects.length,
    "a project is named once"
  )
  .nullable()

export type AccessScope = z.infer<typeof AccessScopeSchema>

export const AccessKeySchema = z.object({
  id: AccessKeyIdSchema,
  name: AccessKeyNameSchema,
  projects: AccessScopeSchema,
  created_at: z.string(),
})

export type AccessKey = z.infer<typeof AccessKeySchema>

export const AccessListResultSchema = z.object({
  keys: z.array(AccessKeySchema),
})

export type AccessListResult = z.infer<typeof AccessListResultSchema>

export const AccessCreateParamsSchema = z.strictObject({
  id: AccessKeyIdSchema,
  name: AccessKeyNameSchema,
  hash: AccessKeyHashSchema,
  projects: AccessScopeSchema,
})

export type AccessCreateParams = z.infer<typeof AccessCreateParamsSchema>

export const AccessUpdateParamsSchema = z.strictObject({
  id: AccessKeyIdSchema,
  name: AccessKeyNameSchema.optional(),
  projects: AccessScopeSchema.optional(),
})

export type AccessUpdateParams = z.infer<typeof AccessUpdateParamsSchema>

export const AccessKeyResultSchema = AccessKeySchema

export const AccessRevokeParamsSchema = z.strictObject({
  id: AccessKeyIdSchema,
})

export const AccessRevokeResultSchema = z.object({
  id: AccessKeyIdSchema,
})

export function accessKeyId(key: string): string | null {
  return ACCESS_KEY_PATTERN.exec(key)?.[1] ?? null
}

// An agent without the gate names no protection, and nothing it publishes asks for a key.
export function guards(
  project: { protected?: boolean },
  process: { protected?: boolean }
): boolean {
  return process.protected ?? project.protected ?? false
}
