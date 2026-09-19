import { SuspensionReason } from "@pupitre/db/cloudflare/enums"
import { t } from "elysia"
import {
  releaseChannelSchema,
  SERVER_STATUSES,
  serverFields,
} from "../servers/schemas"
import {
  adminEventSchema,
  adminLimitSchema,
  adminOffsetSchema,
} from "./schemas"

export const SUSPENSION_REASONS = [
  SuspensionReason.billing,
  SuspensionReason.admin,
] as const

const adminServerFields = {
  ...serverFields,
  suspended_reason: t.Nullable(t.UnionEnum([...SUSPENSION_REASONS])),
  organization: t.Object({
    id: t.String(),
    name: t.String(),
    slug: t.String(),
  }),
}

export const adminServerSchema = t.Object(adminServerFields, {
  $id: "AdminServer",
})

export const adminServerListSchema = t.Object(
  { data: t.Array(adminServerSchema), total: t.Integer() },
  { $id: "AdminServerList" }
)

export const adminServerDetailSchema = t.Object(
  {
    ...adminServerFields,
    channel: releaseChannelSchema,
    assigned_user: t.Nullable(
      t.Object({ id: t.String(), email: t.String(), name: t.String() })
    ),
    device: t.Nullable(
      t.Object({
        id: t.String(),
        name: t.String(),
        user: t.Object({ id: t.String(), email: t.String() }),
      })
    ),
    events: t.Array(adminEventSchema),
  },
  { $id: "AdminServerDetail" }
)

// `t.UnionEnum` carries a default, which a filter must not have.
const statusFilterSchema = t.Union(
  SERVER_STATUSES.map((status) => t.Literal(status))
)

export const adminServersQuery = t.Object({
  status: t.Optional(statusFilterSchema),
  organization_id: t.Optional(t.String({ minLength: 1 })),
  q: t.Optional(t.String({ maxLength: 253 })),
  limit: adminLimitSchema,
  offset: adminOffsetSchema,
})

export const adminSuspendBody = t.Object({
  reason: t.String({ minLength: 1, maxLength: 500 }),
})
