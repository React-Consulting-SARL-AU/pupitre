import { SOCIAL_PROVIDER_IDS } from "@pupitre/auth/server"
import { BILLING_MODES } from "@pupitre/shared/plans"
import { STATUS_FRESHNESS } from "@pupitre/shared/status"
import { t } from "elysia"
import { dateTime } from "../openapi-models"
import { releaseChannelSchema } from "./servers/schemas"

export const publishedReleaseSchema = t.Object(
  {
    version: t.String(),
    channel: releaseChannelSchema,
    published_at: dateTime,
  },
  { $id: "PublishedRelease" }
)

export const serviceHealthSchema = t.UnionEnum(["ok", "down"])

export const statusFreshnessSchema = t.UnionEnum([...STATUS_FRESHNESS])

export const socialProviderSchema = t.UnionEnum([...SOCIAL_PROVIDER_IDS])

export const billingStatusSchema = t.Object(
  {
    mode: t.UnionEnum([...BILLING_MODES]),
    launch_ends_at: t.Nullable(dateTime),
  },
  { $id: "BillingStatus" }
)

export const serviceStatusSchema = t.Object(
  {
    api: serviceHealthSchema,
    database: serviceHealthSchema,
    latest_release: t.Nullable(publishedReleaseSchema),
    active_servers: t.Integer(),
    last_observation_at: t.Nullable(dateTime),
    freshness: statusFreshnessSchema,
    checked_at: dateTime,
    social_providers: t.Array(socialProviderSchema),
    billing: billingStatusSchema,
  },
  { $id: "ServiceStatus" }
)
