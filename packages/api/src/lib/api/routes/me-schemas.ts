import { LOCALES } from "@pupitre/shared/i18n"
import { ORG_ROLES } from "@pupitre/shared/permissions"
import { t } from "elysia"
import { dateTime } from "../openapi-models"
import { serverStatusSchema } from "./servers/schemas"

export const ME_ENTITLEMENTS = ["none", "valid", "grace", "suspended"] as const

export const localeSchema = t.UnionEnum([...LOCALES])

export const localeInputBody = t.Object({ locale: localeSchema })

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
      locale: localeSchema,
      created_at: dateTime,
    }),
    organizations: t.Array(
      t.Object({ ...organizationSummary, role: t.String() })
    ),
    active_organization: t.Nullable(t.Object(organizationSummary)),
    role: t.Nullable(t.UnionEnum([...ORG_ROLES])),
    entitlement: t.UnionEnum([...ME_ENTITLEMENTS]),
  },
  { $id: "Me" }
)

export const serverForUserSchema = t.Object(
  {
    id: t.String(),
    name: t.String(),
    host: t.Nullable(t.String()),
    port: t.Integer(),
    user: t.String(),
    host_fingerprint: t.Nullable(t.String()),
    status: serverStatusSchema,
    key_ready: t.Boolean(),
  },
  { $id: "ServerForUser" }
)
