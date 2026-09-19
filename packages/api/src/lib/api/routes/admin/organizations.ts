import { resolveLocale } from "@pupitre/shared/i18n"
import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { Elysia, t } from "elysia"
import { translate } from "../../../i18n"
import {
  listOrganizationsForPlatform,
  readOrganizationForPlatform,
} from "../../../platform/organizations"
import { apiError } from "../../errors"
import {
  dataResponse,
  errorResponse,
  paginatedResponse,
} from "../../openapi-models"
import { requirePlatformAdmin } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  adminOrganizationDetailSchema,
  adminOrganizationSchema,
  adminOrganizationsQuery,
} from "./platform-schemas"

export const adminOrganizationsRoutes = new Elysia({
  name: "admin-organizations-routes",
})
  .use(requirePlatformAdmin)
  .get(
    "/organizations",
    async ({ query }) =>
      serializeData(
        await listOrganizationsForPlatform({
          q: query.q,
          limit: query.limit ?? ADMIN_PAGE_SIZE,
          offset: query.offset ?? 0,
        })
      ),
    {
      query: adminOrganizationsQuery,
      detail: {
        summary:
          "Toutes les organisations, de la plus récente à la plus ancienne",
      },
      response: {
        200: paginatedResponse(adminOrganizationSchema),
        401: errorResponse,
        403: errorResponse,
        422: errorResponse,
      },
    }
  )
  .get(
    "/organizations/:id",
    async ({ params, request, set }) => {
      const organization = await readOrganizationForPlatform(params.id)

      if (!organization) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "organization_not_found")
        )
      }

      return { data: serializeData(organization) }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary:
          "Une organisation, ses membres, ses serveurs, ses abonnements et son journal",
      },
      response: {
        200: dataResponse(adminOrganizationDetailSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
