import { type Locale, resolveLocale } from "@pupitre/shared/i18n"
import { Elysia } from "elysia"
import {
  BillingCustomerMissingError,
  startCheckout,
  startPortal,
} from "../../../billing/checkout"
import {
  NoPayingSubscriptionError,
  resizeSeats,
  SeatsBelowUsageError,
} from "../../../billing/seats"
import { readSubscription } from "../../../billing/subscription"
import { translate } from "../../../i18n"
import { type ApiErrorPayload, apiError } from "../../errors"
import { errorResponse } from "../../openapi-models"
import { requireRole } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  billingUrlSchema,
  checkoutBody,
  organizationParams,
  seatsBody,
  subscriptionEnvelope,
} from "./schemas"

function organizationNotFound(locale: Locale): ApiErrorPayload {
  return apiError("not_found", translate(locale, "organization_not_found"))
}

export const orgsBillingRoutes = new Elysia({ name: "orgs-billing-routes" })
  .use(requireRole("owner"))
  .post(
    "/:id/checkout",
    async ({ user, organizationId, params, body, request, set }) => {
      const locale = resolveLocale(request.headers)

      if (params.id !== organizationId) {
        set.status = 404

        return organizationNotFound(locale)
      }

      return await startCheckout({ organizationId, email: user.email }, body)
    },
    {
      params: organizationParams,
      body: checkoutBody,
      detail: {
        summary: "Ouvrir un Stripe Checkout pour des sièges de serveur",
      },
      response: {
        200: billingUrlSchema,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
  .post(
    "/:id/portal",
    async ({ organizationId, params, request, set }) => {
      const locale = resolveLocale(request.headers)

      if (params.id !== organizationId) {
        set.status = 404

        return organizationNotFound(locale)
      }

      try {
        return await startPortal(organizationId)
      } catch (error) {
        if (!(error instanceof BillingCustomerMissingError)) {
          throw error
        }

        set.status = 409

        return apiError(
          "conflict",
          translate(locale, "billing_customer_missing"),
          translate(locale, "billing_customer_missing_fix", {
            organization: organizationId,
          })
        )
      }
    },
    {
      params: organizationParams,
      detail: { summary: "Ouvrir le portail client Stripe" },
      response: {
        200: billingUrlSchema,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    }
  )
  .get(
    "/:id/subscription",
    async ({ organizationId, params, request, set }) => {
      if (params.id !== organizationId) {
        set.status = 404

        return organizationNotFound(resolveLocale(request.headers))
      }

      return { data: serializeData(await readSubscription(organizationId)) }
    },
    {
      params: organizationParams,
      detail: { summary: "Le miroir de l'abonnement Stripe" },
      response: {
        200: subscriptionEnvelope,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
  .post(
    "/:id/seats",
    async ({ user, organizationId, params, body, request, set }) => {
      const locale = resolveLocale(request.headers)

      if (params.id !== organizationId) {
        set.status = 404

        return organizationNotFound(locale)
      }

      try {
        const subscription = await resizeSeats(
          { organizationId, userId: user.id },
          body.quantity
        )

        return { data: serializeData(subscription) }
      } catch (error) {
        if (error instanceof NoPayingSubscriptionError) {
          set.status = 409

          return apiError(
            "conflict",
            translate(locale, "subscription_missing"),
            translate(locale, "subscription_missing_fix")
          )
        }

        if (error instanceof SeatsBelowUsageError) {
          set.status = 409

          return apiError(
            "conflict",
            translate(locale, "seats_below_usage", { used: error.used }),
            translate(locale, "seats_below_usage_fix")
          )
        }

        throw error
      }
    },
    {
      params: organizationParams,
      body: seatsBody,
      detail: { summary: "Changer le nombre de sièges de serveur payés" },
      response: {
        200: subscriptionEnvelope,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
