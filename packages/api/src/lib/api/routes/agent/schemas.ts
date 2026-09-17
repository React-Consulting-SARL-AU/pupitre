import { t } from "elysia"
import { dateTime } from "../../openapi-models"
import { architectureSchema } from "../servers/schemas"

export const exchangeBody = t.Object({
  enrollment_token: t.String({ minLength: 1 }),
  host_public_key: t.String({ minLength: 1 }),
  agent_version: t.String({ minLength: 1, maxLength: 40 }),
  arch: architectureSchema,
})

export const serverTokenSchema = t.Object(
  { server_token: t.String() },
  { $id: "AgentServerToken" }
)

export const agentStateSchema = t.Object(
  {
    entitlement: t.UnionEnum(["valid", "grace", "suspended"]),
    valid_until: dateTime,
    authorized_keys: t.Array(t.String()),
    target_version: t.Nullable(t.String()),
    minimum_version: t.Nullable(t.String()),
    hostname: t.String(),
  },
  { $id: "AgentState" }
)

export const HEARTBEAT_MAX_ITEMS = 100

export const HEARTBEAT_MAX_NAME_LENGTH = 200

const heartbeatNames = t.Array(
  t.String({ maxLength: HEARTBEAT_MAX_NAME_LENGTH }),
  { maxItems: HEARTBEAT_MAX_ITEMS }
)

export const heartbeatBody = t.Object({
  disk: t.Number({ minimum: 0 }),
  ram: t.Number({ minimum: 0 }),
  load: t.Number({ minimum: 0 }),
  sessions: heartbeatNames,
  stack_version: t.String({ maxLength: 40 }),
  modules: heartbeatNames,
  agent_version: t.Optional(t.String({ minLength: 1, maxLength: 40 })),

  // The quantities behind the percentages. Optional: an agent older than this
  // field sends none, and the console then has only the percentage to show.
  disk_total_gb: t.Optional(t.Number({ minimum: 0 })),
  disk_free_gb: t.Optional(t.Number({ minimum: 0 })),
  ram_total_mb: t.Optional(t.Number({ minimum: 0 })),
  ram_used_mb: t.Optional(t.Number({ minimum: 0 })),
})
