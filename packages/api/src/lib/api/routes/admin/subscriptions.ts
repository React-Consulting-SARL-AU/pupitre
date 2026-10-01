import { type Locale, resolveLocale } from "@pupitre/shared/i18n"
import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { Elysia, t } from "elysia"
import {
  cancelSubscriptionByAdmin,
  deleteSubscriptionByAdmin,
  grantSubscription,
  PlatformOrganizationError,
  resizeGrantedSubscription,
  resumeSubscriptionByAdmin,
  SubscriptionAlreadyCanceledError,
  SubscriptionLiveError,
  SubscriptionNotGrantedError,
  SubscriptionNotResumableError,
} from "../../../billing/admin"
import { BillingOffError } from "../../../billing/runtime"
import { SeatsBelowUsageError } from "../../../billing/seats"
import { translate } from "../../../i18n"
import { actsOnPlatform } from "../../../platform/actor"
import {
  listSubscriptionsForPlatform,
  readSubscriptionForPlatform,
  viewWrittenSubscription,
} from "../../../platform/subscriptions"
import { type ApiErrorPayload, apiError } from "../../errors"
import {
  dataResponse,
  errorResponse,
  paginatedResponse,
} from "../../openapi-models"
import { requirePlatformAdmin, requirePlatformRole } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  adminGrantBody,
  adminGrantedResizeBody,
  adminSubscriptionDetailSchema,
  adminSubscriptionSchema,
  adminSubscriptionsQuery,
} from "./platform-schemas"
import { adminReasonBody } from "./schemas"

const subscriptionParams = t.Object({ id: t.String() })

function subscriptionNotFound(locale: Locale): ApiErrorPayload {
  return apiError("not_found", translate(locale, "subscription_not_found"))
}

function subscriptionLive(locale: Locale): ApiErrorPayload {
  return apiError(
    "conflict",
    translate(locale, "subscription_live"),
    translate(locale, "subscription_live_fix")
  )
}

function billingOff(locale: Locale): ApiErrorPayload {
  return apiError(
    "conflict",
    translate(locale, "billing_off_stripe"),
    translate(locale, "billing_off_stripe_fix")
  )
}

function endOf(value: string | null | undefined): Date | null | undefined {
  return value === undefined || value === null ? value : new Date(value)
}

async function subscriptionView(id: string) {
  return { data: serializeData(await viewWrittenSubscription(id)) }
}

const readRoutes = new Elysia({ name: "admin-subscriptions-read" })
  .use(requirePlatformAdmin)
  .get(
    "/subscriptions",
    async ({ query, platformRole }) =>
      serializeData(
        await listSubscriptionsForPlatform(
          {
            status: query.status,
            product: query.product,
            organization_id: query.organization_id,
            live: query.live,
            drifted: query.drifted,
            q: query.q,
            sort: query.sort,
            direction: query.direction,
            limit: query.limit ?? ADMIN_PAGE_SIZE,
            offset: query.offset ?? 0,
          },
          actsOnPlatform(platformRole)
        )
      ),
    {
      query: adminSubscriptionsQuery,
      detail: {
        summary: "Tous les abonnements, du plus récent au plus ancien",
      },
      response: {
        200: paginatedResponse(adminSubscriptionSchema),
        401: errorResponse,
        403: errorResponse,
        422: errorResponse,
      },
    }
  )
  .get(
    "/subscriptions/:id",
    async ({ params, platformRole, request, set }) => {
      const subscription = await readSubscriptionForPlatform(
        params.id,
        actsOnPlatform(platformRole)
      )

      if (!subscription) {
        set.status = 404

        return subscriptionNotFound(resolveLocale(request.headers))
      }

      return { data: serializeData(subscription) }
    },
    {
      params: subscriptionParams,
      detail: { summary: "Un abonnement, son organisation et son journal" },
      response: {
        200: dataResponse(adminSubscriptionDetailSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )

const writeRoutes = new Elysia({ name: "admin-subscriptions-write" })
  .use(requirePlatformRole("admin"))
  .post(
    "/organizations/:id/subscriptions",
    async ({ user, params, body, request, set }) => {
      const locale = resolveLocale(request.headers)

      try {
        const granted = await grantSubscription(
          { userId: user.id },
          params.id,
          {
            seats: body.seats,
            ends_at: endOf(body.ends_at),
            note: body.note,
          }
        )

        if (!granted) {
          set.status = 404

          return apiError(
            "not_found",
            translate(locale, "organization_not_found")
          )
        }

        set.status = 201

        return await subscriptionView(granted.id)
      } catch (error) {
        if (error instanceof SubscriptionLiveError) {
          set.status = 409

          return subscriptionLive(locale)
        }

        if (error instanceof PlatformOrganizationError) {
          set.status = 409

          return apiError(
            "conflict",
            translate(locale, "platform_organization"),
            translate(locale, "platform_organization_fix")
          )
        }

        throw error
      }
    },
    {
      params: subscriptionParams,
      body: adminGrantBody,
      detail: { summary: "Accorder un abonnement hors Stripe" },
      response: {
        201: dataResponse(adminSubscriptionSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
  .patch(
    "/subscriptions/:id",
    async ({ user, params, body, request, set }) => {
      const locale = resolveLocale(request.headers)

      try {
        const resized = await resizeGrantedSubscription(
          { userId: user.id },
          params.id,
          { seats: body.seats, ends_at: endOf(body.ends_at) }
        )

        if (!resized) {
          set.status = 404

          return subscriptionNotFound(locale)
        }

        return await subscriptionView(resized.id)
      } catch (error) {
        if (error instanceof SubscriptionNotGrantedError) {
          set.status = 409

          return apiError(
            "conflict",
            translate(locale, "subscription_not_granted"),
            translate(locale, "subscription_not_granted_fix")
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
      params: subscriptionParams,
      body: adminGrantedResizeBody,
      detail: {
        summary: "Changer les sièges ou la fin d'un abonnement accordé",
      },
      response: {
        200: dataResponse(adminSubscriptionSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
  .post(
    "/subscriptions/:id/cancel",
    async ({ user, params, body, request, set }) => {
      const locale = resolveLocale(request.headers)

      try {
        const canceled = await cancelSubscriptionByAdmin(
          { userId: user.id },
          params.id,
          body.reason
        )

        if (!canceled) {
          set.status = 404

          return subscriptionNotFound(locale)
        }

        return await subscriptionView(canceled.id)
      } catch (error) {
        if (error instanceof BillingOffError) {
          set.status = 409

          return billingOff(locale)
        }

        if (!(error instanceof SubscriptionAlreadyCanceledError)) {
          throw error
        }

        set.status = 409

        return apiError(
          "conflict",
          translate(locale, "subscription_already_canceled"),
          translate(locale, "subscription_already_canceled_fix")
        )
      }
    },
    {
      params: subscriptionParams,
      body: adminReasonBody,
      detail: { summary: "Arrêter un abonnement, chez Stripe s'il y vit" },
      response: {
        200: dataResponse(adminSubscriptionSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
  .post(
    "/subscriptions/:id/resume",
    async ({ user, params, request, set }) => {
      const locale = resolveLocale(request.headers)

      try {
        const resumed = await resumeSubscriptionByAdmin(
          { userId: user.id },
          params.id
        )

        if (!resumed) {
          set.status = 404

          return subscriptionNotFound(locale)
        }

        return await subscriptionView(resumed.id)
      } catch (error) {
        if (error instanceof BillingOffError) {
          set.status = 409

          return billingOff(locale)
        }

        if (!(error instanceof SubscriptionNotResumableError)) {
          throw error
        }

        set.status = 409

        return apiError(
          "conflict",
          translate(locale, "subscription_not_resumable"),
          translate(locale, "subscription_not_resumable_fix")
        )
      }
    },
    {
      params: subscriptionParams,
      detail: {
        summary: "Reprendre un abonnement résilié à la fin de la période",
      },
      response: {
        200: dataResponse(adminSubscriptionSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    }
  )
  .delete(
    "/subscriptions/:id",
    async ({ user, params, request, set }) => {
      const locale = resolveLocale(request.headers)

      try {
        const deleted = await deleteSubscriptionByAdmin(
          { userId: user.id },
          params.id
        )

        if (!deleted) {
          set.status = 404

          return subscriptionNotFound(locale)
        }

        set.status = 204
      } catch (error) {
        if (!(error instanceof SubscriptionLiveError)) {
          throw error
        }

        set.status = 409

        return subscriptionLive(locale)
      }
    },
    {
      params: subscriptionParams,
      detail: { summary: "Effacer un abonnement que Stripe ne facture plus" },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    }
  )

export const adminSubscriptionsRoutes = new Elysia({
  name: "admin-subscriptions-routes",
})
  .use(readRoutes)
  .use(writeRoutes)
