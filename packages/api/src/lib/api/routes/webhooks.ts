import { Elysia } from "elysia"
import {
  handleStripeWebhook,
  StripeEventMalformedError,
  StripeSignatureInvalidError,
} from "../../billing/webhook"
import { resolveLocale, translate } from "../../i18n"
import { apiError } from "../errors"
import { errorResponse } from "../openapi-models"
import { stripeWebhookAck, stripeWebhookBody } from "./webhook-schemas"

const SIGNATURE_HEADER = "stripe-signature"

export const webhooksRoutes = new Elysia({
  name: "webhooks-routes",
  tags: ["Webhooks"],
}).post(
  "/webhooks/stripe",
  async ({ body, request, set }) => {
    const locale = resolveLocale(request.headers)

    try {
      const result = await handleStripeWebhook({
        payload: body,
        signature: request.headers.get(SIGNATURE_HEADER),
      })

      return {
        received: true,
        handled: result.handled,
        duplicate: result.duplicate,
      }
    } catch (error) {
      if (error instanceof StripeSignatureInvalidError) {
        set.status = 400

        return apiError(
          "stripe_signature_invalid",
          translate(locale, "stripe_signature_invalid"),
          translate(locale, "stripe_signature_invalid_fix")
        )
      }

      if (error instanceof StripeEventMalformedError) {
        set.status = 400

        return apiError(
          "validation",
          translate(locale, "unreadable_body"),
          translate(locale, "unreadable_body_fix")
        )
      }

      throw error
    }
  },
  {
    parse: "text",
    body: stripeWebhookBody,
    detail: {
      summary: "Les événements Stripe, signés et idempotents",
    },
    response: { 200: stripeWebhookAck, 400: errorResponse },
  }
)
