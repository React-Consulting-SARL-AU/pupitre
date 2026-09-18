import { ORG_ROLES } from "@pupitre/shared/permissions"
import { t } from "elysia"
import { CHECKOUT_RETURNS } from "../../../billing/checkout"
import { BILLING_INTERVALS } from "../../../billing/provider"
import { EVENTS_MAX_PAGE_SIZE } from "../../../orgs/events"
import { dateTime } from "../../openapi-models"

export const billingIntervalSchema = t.UnionEnum([...BILLING_INTERVALS])

export const organizationParams = t.Object({ id: t.String() })

export const MIN_SEATS = 1

export const MAX_SEATS = 500

const seatQuantity = t.Integer({ minimum: MIN_SEATS, maximum: MAX_SEATS })

export const checkoutBody = t.Object({
  quantity: seatQuantity,
  interval: billingIntervalSchema,
  return_to: t.Optional(t.UnionEnum([...CHECKOUT_RETURNS])),
  affiliate_code: t.Optional(t.String({ maxLength: 64 })),
})

export const seatsBody = t.Object({ quantity: seatQuantity })

export const billingUrlSchema = t.Object(
  { url: t.String() },
  { $id: "BillingUrl" }
)

export const subscriptionSchema = t.Object(
  {
    id: t.String(),
    stripe_subscription_id: t.String(),
    product: t.String(),
    quantity: t.Integer(),
    status: t.String(),
    interval: t.Nullable(billingIntervalSchema),
    current_period_end: t.Nullable(dateTime),
    created_at: dateTime,
    updated_at: dateTime,
  },
  { $id: "Subscription" }
)

export const subscriptionEnvelope = t.Object(
  { data: t.Nullable(subscriptionSchema) },
  { $id: "SubscriptionEnvelope" }
)

export const memberSchema = t.Object(
  {
    id: t.String(),
    user_id: t.String(),
    email: t.String(),
    name: t.String(),
    role: t.String(),
    created_at: dateTime,
  },
  { $id: "OrganizationMember" }
)

export const invitationSchema = t.Object(
  {
    id: t.String(),
    email: t.String(),
    role: t.Nullable(t.String()),
    status: t.String(),
    expires_at: dateTime,
    created_at: dateTime,
    inviter_id: t.String(),
  },
  { $id: "OrganizationInvitation" }
)

export const membersSchema = t.Object(
  {
    members: t.Array(memberSchema),
    invitations: t.Array(invitationSchema),
  },
  { $id: "OrganizationMembers" }
)

export const invitationBody = t.Object({
  email: t.String({
    minLength: 3,
    maxLength: 254,
    pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
  }),
  role: t.UnionEnum([...ORG_ROLES]),
})

export const eventSchema = t.Object(
  {
    id: t.String(),
    action: t.String(),
    actor_user_id: t.Nullable(t.String()),
    actor_email: t.Nullable(t.String()),
    target_type: t.String(),
    target_id: t.String(),
    payload: t.Unknown(),
    created_at: dateTime,
  },
  { $id: "OrganizationEvent" }
)

export const eventsQuery = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: EVENTS_MAX_PAGE_SIZE })),
  offset: t.Optional(t.Integer({ minimum: 0 })),
  action: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
})
