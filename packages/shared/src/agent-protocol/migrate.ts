import { z } from "zod"

// `pending`: an install held the lock. `failed`: put back as it was. `ahead`: set by a newer agent.
const CONFIG_STATES = ["current", "pending", "failed", "ahead"] as const

const ConfigStateSchema = z.enum(CONFIG_STATES)

export type ConfigState = z.infer<typeof ConfigStateSchema>

// A plain counter owned by the agent, not its version: shapes do not change once per release.
export const ConfigRevisionSchema = z.object({
  revision: z.int().nonnegative(),
  expected: z.int().nonnegative(),
  state: ConfigStateSchema,
})

export type ConfigRevision = z.infer<typeof ConfigRevisionSchema>

const MigrationRunSchema = z.object({
  id: z.int().positive(),
  slug: z.string(),
  ms: z.int().nonnegative(),
})

const MigrationFailureSchema = z.object({
  id: z.int().positive(),
  slug: z.string(),
  message: z.string(),
})

export const AgentMigrateResultSchema = z.object({
  revision: z.int().nonnegative(),
  expected: z.int().nonnegative(),
  state: ConfigStateSchema,
  // Usually empty: the agent migrates itself at start-up, which makes the command safe to call twice.
  applied: z.array(MigrationRunSchema),
  pending: z.array(z.int().positive()),
  // Named even on success, so a reader has somewhere to go.
  backup: z.string().optional(),
  failure: MigrationFailureSchema.optional(),
  restored: z.boolean().default(false),
})

export type AgentMigrateResult = z.infer<typeof AgentMigrateResultSchema>
