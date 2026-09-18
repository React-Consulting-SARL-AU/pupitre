import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { Elysia } from "elysia"
import { listEventsForPlatform } from "../../../platform/events"
import { errorResponse, paginatedResponse } from "../../openapi-models"
import { requirePlatformAdmin } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import { adminEventSchema, adminEventsQuery } from "./schemas"

export const adminEventsRoutes = new Elysia({ name: "admin-events-routes" })
  .use(requirePlatformAdmin)
  .get(
    "/events",
    async ({ query }) =>
      serializeData(
        await listEventsForPlatform({
          organization_id: query.organization_id,
          actor_user_id: query.actor_user_id,
          action: query.action,
          target_type: query.target_type,
          limit: query.limit ?? ADMIN_PAGE_SIZE,
          offset: query.offset ?? 0,
        })
      ),
    {
      query: adminEventsQuery,
      detail: { summary: "Le journal de la plateforme, filtrable" },
      response: {
        200: paginatedResponse(adminEventSchema),
        401: errorResponse,
        403: errorResponse,
        422: errorResponse,
      },
    }
  )
