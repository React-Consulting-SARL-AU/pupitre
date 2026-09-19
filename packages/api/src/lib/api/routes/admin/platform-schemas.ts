import { ORG_ROLES } from "@pupitre/shared/permissions"
import { ACCOUNT_STATES, ORGANIZATION_STATES } from "@pupitre/shared/platform"
import { t } from "elysia"
import { dateTime } from "../../openapi-models"
import { MAX_SEATS, MIN_SEATS } from "../orgs/schemas"
import { serverStatusSchema } from "../servers/schemas"
import {
  adminEventSchema,
  adminLimitSchema,
  adminOffsetSchema,
} from "./schemas"
import { adminServerSchema } from "./server-schemas"

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

export const accountStateSchema = t.UnionEnum([...ACCOUNT_STATES])

export const organizationStateSchema = t.UnionEnum([...ORGANIZATION_STATES])

const adminUserFields = {
  id: t.String(),
  email: t.String(),
  name: t.String(),
  role: t.Nullable(t.String()),
  banned: t.Boolean(),
  email_verified: t.Boolean(),
  created_at: dateTime,
  state: accountStateSchema,
  ban_expires_at: t.Nullable(dateTime),
  deactivated_at: t.Nullable(dateTime),
  deactivated_reason: t.Nullable(t.String()),
  deletion_at: t.Nullable(dateTime),
  deletion_reason: t.Nullable(t.String()),
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
    sessions: t.Integer(),
    last_seen_at: t.Nullable(dateTime),
    events: t.Array(adminEventSchema),
  },
  { $id: "AdminUserDetail" }
)

/** A sanction that ends by itself: `until` in the future, or nothing for an open one. */
export const adminBanBody = t.Object({
  reason: t.String({ minLength: 1, maxLength: 500 }),
  until: t.Optional(t.Nullable(dateTime)),
})

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
  state: organizationStateSchema,
  suspended_at: t.Nullable(dateTime),
  suspended_reason: t.Nullable(t.String()),
  closed_at: t.Nullable(dateTime),
  closed_reason: t.Nullable(t.String()),
  deletion_at: t.Nullable(dateTime),
  deletion_reason: t.Nullable(t.String()),
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
  { ...adminSubscriptionViewFields, events: t.Array(adminEventSchema) },
  { $id: "AdminSubscriptionDetail" }
)

export const adminSubscriptionsQuery = t.Object({
  status: t.Optional(t.String({ maxLength: 40 })),
  product: t.Optional(t.String({ maxLength: 120 })),
  limit: adminLimitSchema,
  offset: adminOffsetSchema,
})

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

export const adminOrganizationRenameBody = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
  slug: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
})

export const adminOrganizationTransferBody = t.Object({
  user_id: t.String({ minLength: 1 }),
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
