import { z } from "zod"
import { BackupBeatSchema } from "../backup"
import { ArchitectureSchema } from "../catalog"
import { AgentStateKeySchema, KeysBeatSchema } from "../keys"
import { SSH_USER_MAX, SSH_USER_PATTERN } from "../ssh"
import { InstantSchema, ServerEntitlementSchema } from "./index"

const AGENT_VERSION_MAX = 40

const SshUserSchema = z
  .string()
  .max(SSH_USER_MAX)
  .regex(new RegExp(SSH_USER_PATTERN))

export const AgentExchangeSchema = z.object({
  enrollment_token: z.string().min(1),
  host_public_key: z.string().min(1),
  agent_version: z.string().min(1).max(AGENT_VERSION_MAX),
  arch: ArchitectureSchema,
})

export type AgentExchange = z.infer<typeof AgentExchangeSchema>

export const ServerTokenSchema = z.object({ server_token: z.string() })

export type ServerToken = z.infer<typeof ServerTokenSchema>

export const AgentStateSchema = z.object({
  entitlement: ServerEntitlementSchema,
  valid_until: InstantSchema,
  // For agents older than the approvals, which read it instead of `keys`.
  authorized_keys: z.array(z.string()),
  keys: z.array(AgentStateKeySchema),
  target_version: z.string().nullable(),
  minimum_version: z.string().nullable(),
  hostname: z.string(),
  server_id: z.string(),
})

export type AgentState = z.infer<typeof AgentStateSchema>

const HEARTBEAT_MAX_ITEMS = 100

const HEARTBEAT_MAX_NAME_LENGTH = 200

const HeartbeatNamesSchema = z
  .array(z.string().max(HEARTBEAT_MAX_NAME_LENGTH))
  .max(HEARTBEAT_MAX_ITEMS)

const QuantitySchema = z.number().nonnegative()

// An optional field left out keeps what the platform knew: older agents never send it.
export const HeartbeatSchema = z.object({
  disk: QuantitySchema,
  ram: QuantitySchema,
  load: QuantitySchema,
  sessions: HeartbeatNamesSchema,
  stack_version: z.string().max(AGENT_VERSION_MAX),
  modules: HeartbeatNamesSchema,
  agent_version: z.string().min(1).max(AGENT_VERSION_MAX).optional(),
  ssh_user: SshUserSchema.optional(),
  disk_total_gb: QuantitySchema.optional(),
  disk_free_gb: QuantitySchema.optional(),
  ram_total_mb: QuantitySchema.optional(),
  ram_used_mb: QuantitySchema.optional(),
  backup: BackupBeatSchema.optional(),
  keys: KeysBeatSchema.optional(),
})

export type Heartbeat = z.infer<typeof HeartbeatSchema>
