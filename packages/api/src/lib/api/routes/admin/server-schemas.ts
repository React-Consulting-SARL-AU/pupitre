import { SuspensionReason } from "@pupitre/db/cloudflare/enums"
import { SERVER_STATUSES } from "@pupitre/shared/platform-api"
import { t } from "elysia"
import { ADMIN_SERVER_SORTS } from "../../../servers/admin"
import { dateTime } from "../../openapi-models"
import {
  metricSampleSchema,
  releaseChannelSchema,
  serverFields,
} from "../servers/schemas"
import {
  adminDirectionSchema,
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
  channel: releaseChannelSchema,
  seated: t.Boolean(),
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

const adminServerDeviceSchema = t.Object({
  id: t.String(),
  name: t.String(),
  last_used_at: t.Nullable(dateTime),
  user: t.Object({ id: t.String(), email: t.String() }),
})

const adminServerActorSchema = t.Object({
  id: t.String(),
  email: t.String(),
  name: t.String(),
})

export const adminServerDetailSchema = t.Object(
  {
    ...adminServerFields,
    enrollment_expires_at: t.Nullable(dateTime),
    assigned_user: t.Nullable(adminServerActorSchema),
    device: t.Nullable(adminServerDeviceSchema),
    revoked_devices: t.Array(
      t.Object({
        device: adminServerDeviceSchema,
        revoked_by: t.Nullable(adminServerActorSchema),
        revoked_at: dateTime,
      })
    ),
    metrics: t.Array(metricSampleSchema),
    events: t.Array(adminEventSchema),
  },
  { $id: "AdminServerDetail" }
)

// `t.UnionEnum` carries a default, which a filter must not have.
const statusFilterSchema = t.Union(
  SERVER_STATUSES.map((status) => t.Literal(status))
)

const serverSortSchema = t.Optional(
  t.Union(ADMIN_SERVER_SORTS.map((sort) => t.Literal(sort)))
)

export const adminServersQuery = t.Object({
  status: t.Optional(statusFilterSchema),
  organization_id: t.Optional(t.String({ minLength: 1 })),
  q: t.Optional(t.String({ maxLength: 253 })),
  stale: t.Optional(t.Boolean()),
  sort: serverSortSchema,
  direction: adminDirectionSchema,
  limit: adminLimitSchema,
  offset: adminOffsetSchema,
})

export const adminServerChannelBody = t.Object({
  channel: releaseChannelSchema,
})
