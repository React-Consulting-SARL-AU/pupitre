import { ServerStatus } from "@pupitre/db/cloudflare/enums"
import { ORG_ROLES } from "@pupitre/shared/permissions"
import { t } from "elysia"
import { dateTime } from "../openapi-models"

const SERVER_STATUSES = [
  ServerStatus.enrolling,
  ServerStatus.active,
  ServerStatus.grace,
  ServerStatus.suspended,
  ServerStatus.revoked,
] as const

const organizationSummary = {
  id: t.String(),
  name: t.String(),
  slug: t.String(),
}

export const meSchema = t.Object(
  {
    user: t.Object({
      id: t.String(),
      email: t.String(),
      name: t.String(),
      image: t.Nullable(t.String()),
      created_at: dateTime,
    }),
    organizations: t.Array(
      t.Object({ ...organizationSummary, role: t.String() })
    ),
    active_organization: t.Nullable(t.Object(organizationSummary)),
    role: t.Nullable(t.UnionEnum([...ORG_ROLES])),
    entitlement: t.Literal("none"),
  },
  { $id: "Me" }
)

export const serverForUserSchema = t.Object(
  {
    id: t.String(),
    name: t.String(),
    host: t.Nullable(t.String()),
    port: t.Nullable(t.Integer()),
    user: t.Nullable(t.String()),
    host_fingerprint: t.Nullable(t.String()),
    status: t.UnionEnum([...SERVER_STATUSES]),
    key_ready: t.Boolean(),
  },
  { $id: "ServerForUser" }
)
