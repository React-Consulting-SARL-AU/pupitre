import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { Elysia } from "elysia"
import { listSubscriptionsForPlatform } from "../../../platform/subscriptions"
import { errorResponse, paginatedResponse } from "../../openapi-models"
import { requirePlatformAdmin } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  adminSubscriptionSchema,
  adminSubscriptionsQuery,
} from "./platform-schemas"

export const adminSubscriptionsRoutes = new Elysia({
  name: "admin-subscriptions-routes",
})
  .use(requirePlatformAdmin)
  .get(
    "/subscriptions",
    async ({ query }) =>
      serializeData(
        await listSubscriptionsForPlatform({
          status: query.status,
          product: query.product,
          limit: query.limit ?? ADMIN_PAGE_SIZE,
          offset: query.offset ?? 0,
        })
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
