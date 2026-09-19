import { StripeEventStatus } from "@pupitre/db/cloudflare/enums"
import { ORG_ROLES } from "@pupitre/shared/permissions"
import { t } from "elysia"
import { ADMIN_SUBSCRIPTION_SORTS } from "../../../platform/subscriptions"
import { dateTime } from "../../openapi-models"
import { MAX_SEATS, MIN_SEATS } from "../orgs/schemas"
import { serverStatusSchema } from "../servers/schemas"
import {
  adminDirectionSchema,
  adminEventSchema,
  adminLimitSchema,
  adminOffsetSchema,
} from "./schemas"
import { adminServerSchema } from "./server-schemas"

const STRIPE_EVENT_STATUSES = [
  StripeEventStatus.processing,
  StripeEventStatus.processed,
  StripeEventStatus.failed,
] as const

export const orgRoleSchema = t.UnionEnum([...ORG_ROLES])

export const adminOverviewSchema = t.Object(
  {
    users: t.Integer(),
    organizations: t.Integer(),
    servers: t.Object({
      total: t.Integer(),
      enrolling: t.Integer(),
      active: t.Integer(),
      grace: t.Integer(),
      suspended: t.Integer(),
      revoked: t.Integer(),
    }),
    subscriptions: t.Object({
      total: t.Integer(),
      trialing: t.Integer(),
      active: t.Integer(),
      past_due: t.Integer(),
      canceled: t.Integer(),
      other: t.Integer(),
      launch: t.Integer(),
    }),
    affiliate_links: t.Integer(),
    referrals: t.Integer(),
  },
  { $id: "AdminOverview" }
)

const adminUserFields = {
  id: t.String(),
  email: t.String(),
  name: t.String(),
  role: t.Nullable(t.String()),
  banned: t.Boolean(),
  email_verified: t.Boolean(),
  created_at: dateTime,
  organizations: t.Array(
    t.Object({
      id: t.String(),
      name: t.String(),
      slug: t.String(),
      role: t.String(),
      subscription_status: t.Nullable(t.String()),
      servers: t.Integer(),
    })
  ),
}

export const adminUserSchema = t.Object(adminUserFields, { $id: "AdminUser" })

export const adminUserDetailSchema = t.Object(
  {
    ...adminUserFields,
    devices: t.Array(
      t.Object({
        id: t.String(),
        name: t.String(),
        created_at: dateTime,
        last_used_at: t.Nullable(dateTime),
      })
    ),
    assigned_servers: t.Array(
      t.Object({
        id: t.String(),
        name: t.String(),
        host: t.Nullable(t.String()),
        status: serverStatusSchema,
        organization: t.Object({ id: t.String(), name: t.String() }),
      })
    ),
    platform_role: t.Nullable(orgRoleSchema),
    banned_reason: t.Nullable(t.String()),
    ban_expires_at: t.Nullable(dateTime),
    events: t.Array(adminEventSchema),
  },
  { $id: "AdminUserDetail" }
)

export const adminUsersQuery = t.Object({
  q: t.Optional(t.String({ maxLength: 254 })),
  limit: adminLimitSchema,
  offset: adminOffsetSchema,
})

const adminSubscriptionFields = {
  id: t.String(),
  stripe_subscription_id: t.String(),
  product: t.String(),
  quantity: t.Integer(),
  status: t.String(),
  current_period_end: t.Nullable(dateTime),
  cancel_at_period_end: t.Boolean(),
  note: t.Nullable(t.String()),
  platform: t.Boolean(),
  created_at: dateTime,
  updated_at: dateTime,
}

const adminOrganizationFields = {
  id: t.String(),
  name: t.String(),
  slug: t.String(),
  personal: t.Boolean(),
  created_at: dateTime,
  subscription: t.Nullable(
    t.Object({
      status: t.String(),
      product: t.String(),
      quantity: t.Integer(),
      current_period_end: t.Nullable(dateTime),
    })
  ),
  referral: t.Nullable(t.Object({ code: t.String(), name: t.String() })),
}

export const adminOrganizationSchema = t.Object(
  {
    ...adminOrganizationFields,
    members: t.Integer(),
    servers: t.Integer(),
  },
  { $id: "AdminOrganization" }
)

const adminOrganizationMemberSchema = t.Object({
  user_id: t.String(),
  email: t.String(),
  name: t.String(),
  role: t.String(),
  created_at: dateTime,
})

export const adminOrganizationDetailSchema = t.Object(
  {
    ...adminOrganizationFields,
    members: t.Array(adminOrganizationMemberSchema),
    servers: t.Array(adminServerSchema),
    subscriptions: t.Array(t.Object(adminSubscriptionFields)),
    events: t.Array(adminEventSchema),
  },
  { $id: "AdminOrganizationDetail" }
)

export const adminOrganizationsQuery = t.Object({
  q: t.Optional(t.String({ maxLength: 254 })),
  limit: adminLimitSchema,
  offset: adminOffsetSchema,
})

const adminSubscriptionViewFields = {
  ...adminSubscriptionFields,
  organization: t.Object({
    id: t.String(),
    name: t.String(),
    slug: t.String(),
  }),
  live: t.Boolean(),
}

export const adminSubscriptionSchema = t.Object(adminSubscriptionViewFields, {
  $id: "AdminSubscription",
})

export const adminSubscriptionDetailSchema = t.Object(
  {
    ...adminSubscriptionViewFields,
    seats: t.Object({ paid: t.Integer(), used: t.Integer() }),
    drifted: t.Boolean(),
    stripe_url: t.Nullable(t.String()),
    stripe_events: t.Array(
      t.Object({
        id: t.String(),
        type: t.String(),
        status: t.UnionEnum([...STRIPE_EVENT_STATUSES]),
        received_at: dateTime,
      })
    ),
    events: t.Array(adminEventSchema),
  },
  { $id: "AdminSubscriptionDetail" }
)

const subscriptionSortSchema = t.Optional(
  t.Union(ADMIN_SUBSCRIPTION_SORTS.map((sort) => t.Literal(sort)))
)

export const adminSubscriptionsQuery = t.Object({
  status: t.Optional(t.String({ maxLength: 40 })),
  product: t.Optional(t.String({ maxLength: 120 })),
  organization_id: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
  live: t.Optional(t.Boolean()),
  q: t.Optional(t.String({ maxLength: 254 })),
  sort: subscriptionSortSchema,
  direction: adminDirectionSchema,
  limit: adminLimitSchema,
  offset: adminOffsetSchema,
})

export const adminTrialBody = t.Object({ ends_at: dateTime })

const grantedSeats = t.Integer({ minimum: MIN_SEATS, maximum: MAX_SEATS })

const grantedEnd = t.Nullable(dateTime)

export const adminGrantBody = t.Object({
  seats: grantedSeats,
  ends_at: t.Optional(grantedEnd),
  note: t.Optional(t.String({ maxLength: 500 })),
})

export const adminGrantedResizeBody = t.Object({
  seats: t.Optional(grantedSeats),
  ends_at: t.Optional(grantedEnd),
})

export const adminTeamMemberSchema = t.Object(
  {
    user_id: t.String(),
    email: t.String(),
    name: t.String(),
    role: t.String(),
    created_at: dateTime,
  },
  { $id: "AdminTeamMember" }
)
