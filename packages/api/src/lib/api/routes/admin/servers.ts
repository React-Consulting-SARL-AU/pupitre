import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import { translate } from "../../../i18n"
import {
  listServersForPlatform,
  ServerRevokedError,
  suspendServerByAdmin,
} from "../../../servers/admin"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requirePlatformAdmin } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  ADMIN_SERVERS_PAGE_SIZE,
  adminServerListSchema,
  adminServerSchema,
  adminServersQuery,
  adminSuspendBody,
} from "./server-schemas"

export const adminServersRoutes = new Elysia({
  name: "admin-servers-routes",
})
  .use(requirePlatformAdmin)
  .get(
    "/servers",
    async ({ query }) =>
      serializeData(
        await listServersForPlatform({
          status: query.status,
          organization_id: query.organization_id,
          q: query.q,
          limit: query.limit ?? ADMIN_SERVERS_PAGE_SIZE,
          offset: query.offset ?? 0,
        })
      ),
    {
      query: adminServersQuery,
      detail: { summary: "Tous les serveurs de la plateforme, filtrables" },
      response: {
        200: adminServerListSchema,
        401: errorResponse,
        403: errorResponse,
        422: errorResponse,
      },
    }
  )
  .post(
    "/servers/:id/suspend",
    async ({ user, params, body, request, set }) => {
      const locale = resolveLocale(request.headers)

      try {
        const suspended = await suspendServerByAdmin(
          { userId: user.id },
          params.id,
          body.reason
        )

        if (!suspended) {
          set.status = 404

          return apiError("not_found", translate(locale, "server_not_found"))
        }

        return { data: serializeData(suspended) }
      } catch (error) {
        if (!(error instanceof ServerRevokedError)) {
          throw error
        }

        set.status = 409

        return apiError(
          "conflict",
          translate(locale, "server_revoked_no_suspend"),
          translate(locale, "server_revoked_no_suspend_fix")
        )
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: adminSuspendBody,
      detail: { summary: "Suspendre un serveur, avec la raison" },
      response: {
        200: dataResponse(adminServerSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
