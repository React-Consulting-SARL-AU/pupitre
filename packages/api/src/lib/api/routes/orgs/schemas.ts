import { t } from "elysia"
import {
  BILLING_CURRENCIES,
  BILLING_INTERVALS,
} from "../../../billing/provider"
import { dateTime } from "../../openapi-models"

export const billingIntervalSchema = t.UnionEnum([...BILLING_INTERVALS])

export const billingCurrencySchema = t.UnionEnum([...BILLING_CURRENCIES])

export const organizationParams = t.Object({ id: t.String() })

export const checkoutBody = t.Object({
  quantity: t.Integer({ minimum: 1, maximum: 500 }),
  interval: billingIntervalSchema,
})

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
