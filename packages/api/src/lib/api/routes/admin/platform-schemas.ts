import { ORG_ROLES } from "@pupitre/shared/permissions"
import { t } from "elysia"
import { dateTime } from "../../openapi-models"
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

export const adminBanBody = t.Object({
  reason: t.String({ minLength: 1, maxLength: 500 }),
})

const adminSubscriptionFields = {
  id: t.String(),
  stripe_subscription_id: t.String(),
  product: t.String(),
  quantity: t.Integer(),
  status: t.String(),
  current_period_end: t.Nullable(dateTime),
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

export const adminSubscriptionSchema = t.Object(
  {
    ...adminSubscriptionFields,
    organization: t.Object({
      id: t.String(),
      name: t.String(),
      slug: t.String(),
    }),
    live: t.Boolean(),
  },
  { $id: "AdminSubscription" }
)

export const adminSubscriptionsQuery = t.Object({
  status: t.Optional(t.String({ maxLength: 40 })),
  product: t.Optional(t.String({ maxLength: 120 })),
  limit: adminLimitSchema,
  offset: adminOffsetSchema,
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
