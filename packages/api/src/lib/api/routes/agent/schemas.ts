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

export const heartbeatBody = t.Object({
  disk: t.Number({ minimum: 0 }),
  ram: t.Number({ minimum: 0 }),
  load: t.Number({ minimum: 0 }),
  sessions: t.Array(t.String()),
  stack_version: t.String(),
  modules: t.Array(t.String()),
  agent_version: t.Optional(t.String({ minLength: 1, maxLength: 40 })),
})
