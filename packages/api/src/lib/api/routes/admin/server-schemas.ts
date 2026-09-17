import { SuspensionReason } from "@pupitre/db/cloudflare/enums"
import { t } from "elysia"
import { SERVER_STATUSES, serverFields } from "../servers/schemas"

export const ADMIN_SERVERS_PAGE_SIZE = 50

export const ADMIN_SERVERS_MAX_PAGE_SIZE = 200

export const SUSPENSION_REASONS = [
  SuspensionReason.billing,
  SuspensionReason.admin,
] as const

export const adminServerSchema = t.Object(
  {
    ...serverFields,
    suspended_reason: t.Nullable(t.UnionEnum([...SUSPENSION_REASONS])),
    organization: t.Object({
      id: t.String(),
      name: t.String(),
      slug: t.String(),
    }),
  },
  { $id: "AdminServer" }
)

export const adminServerListSchema = t.Object(
  { data: t.Array(adminServerSchema), total: t.Integer() },
  { $id: "AdminServerList" }
)

// `t.UnionEnum` carries a default, which a filter must not have.
const statusFilterSchema = t.Union(
  SERVER_STATUSES.map((status) => t.Literal(status))
)

export const adminServersQuery = t.Object({
  status: t.Optional(statusFilterSchema),
  organization_id: t.Optional(t.String({ minLength: 1 })),
  q: t.Optional(t.String({ maxLength: 253 })),
  limit: t.Optional(
    t.Integer({ minimum: 1, maximum: ADMIN_SERVERS_MAX_PAGE_SIZE })
  ),
  offset: t.Optional(t.Integer({ minimum: 0 })),
})

export const adminSuspendBody = t.Object({
  reason: t.String({ minLength: 1, maxLength: 500 }),
})
