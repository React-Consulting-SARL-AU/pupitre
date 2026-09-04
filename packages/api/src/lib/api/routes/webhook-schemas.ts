import { t } from "elysia"

export const stripeWebhookBody = t.String()

export const stripeWebhookAck = t.Object(
  {
    received: t.Boolean(),
    handled: t.Boolean(),
    duplicate: t.Boolean(),
  },
  { $id: "StripeWebhookAck" }
)
