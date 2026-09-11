import { z } from "zod"

/**
 * The configuration the agent holds on the machine, and the revision it is at.
 *
 * A binary and the files it reads travel separately: the binary is replaced by
 * `agent.upgrade`, the files stay where they are. When a release changes the
 * shape of one of those files — a field renamed, a module split in two, a
 * default that stopped being a default — the new binary would read the old
 * shape and get it wrong. A numbered ledger closes that gap: every shape change
 * is one migration, migrations run in order, and the machine remembers how far
 * it has gone.
 *
 * The number is not the agent's version. Shapes do not change once per release,
 * and a pre-release or a development build has no place in an ordering that has
 * to be exact. It is a plain counter, owned by the agent, that only goes up.
 */
export const CONFIG_STATES = ["current", "pending", "failed", "ahead"] as const

export const ConfigStateSchema = z.enum(CONFIG_STATES)

export type ConfigState = z.infer<typeof ConfigStateSchema>

/**
 * `pending` is a machine whose migrations have not run yet — the lock was held
 * by an install. `failed` is a machine whose configuration was put back as it
 * was, because a migration refused. `ahead` is a machine configured by a newer
 * agent than the one now running it, which happens after a downgrade.
 */
export const ConfigRevisionSchema = z.object({
  revision: z.int().nonnegative(),
  expected: z.int().nonnegative(),
  state: ConfigStateSchema,
})

export type ConfigRevision = z.infer<typeof ConfigRevisionSchema>

export const MigrationRunSchema = z.object({
  id: z.int().positive(),
  slug: z.string(),
  ms: z.int().nonnegative(),
})

export type MigrationRun = z.infer<typeof MigrationRunSchema>

export const MigrationFailureSchema = z.object({
  id: z.int().positive(),
  slug: z.string(),
  message: z.string(),
})

export type MigrationFailure = z.infer<typeof MigrationFailureSchema>

/**
 * What one call to `agent.migrate` did, and where it left the machine.
 *
 * `applied` is what this call ran, empty when the agent had already migrated
 * itself at start-up — which is the normal case, and why the command is safe to
 * call twice. `backup` names the folder holding the files as they were before
 * the batch: it is what a rollback puts back, and it is named even on success
 * so a reader has somewhere to go.
 */
export const AgentMigrateResultSchema = z.object({
  revision: z.int().nonnegative(),
  expected: z.int().nonnegative(),
  state: ConfigStateSchema,
  applied: z.array(MigrationRunSchema),
  pending: z.array(z.int().positive()),
  backup: z.string().optional(),
  failure: MigrationFailureSchema.optional(),
  /** Whether the failure was followed by putting the previous files back. */
  restored: z.boolean().default(false),
})

export type AgentMigrateResult = z.infer<typeof AgentMigrateResultSchema>
