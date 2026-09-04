import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia } from "elysia"
import { translate } from "../../../i18n"
import { listEvents } from "../../../orgs/events"
import { apiError } from "../../errors"
import { errorResponse, paginatedResponse } from "../../openapi-models"
import { requireRole } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import { eventSchema, eventsQuery, organizationParams } from "./schemas"

export const orgsEventsRoutes = new Elysia({ name: "orgs-events-routes" })
  .use(requireRole("admin"))
  .get(
    "/:id/events",
    async ({ organizationId, params, query, request, set }) => {
      if (params.id !== organizationId) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "organization_not_found")
        )
      }

      return serializeData(await listEvents(organizationId, query))
    },
    {
      params: organizationParams,
      query: eventsQuery,
      detail: { summary: "Le journal d'audit de l'organisation" },
      response: {
        200: paginatedResponse(eventSchema, "OrganizationEventPage"),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
