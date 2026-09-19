import { resolveLocale } from "@pupitre/shared/i18n"
import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { Elysia, t } from "elysia"
import { translate } from "../../../i18n"
import {
  deleteServerByAdmin,
  listServersForPlatform,
  readServerForPlatform,
  restoreServerByAdmin,
  ServerNotAdminSuspendedError,
  ServerRevokedError,
  suspendServerByAdmin,
} from "../../../servers/admin"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requirePlatformAdmin, requirePlatformRole } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import { adminReasonBody } from "./schemas"
import {
  adminServerDetailSchema,
  adminServerListSchema,
  adminServerSchema,
  adminServersQuery,
} from "./server-schemas"

const serverParams = t.Object({ id: t.String() })

const readRoutes = new Elysia({ name: "admin-servers-read" })
  .use(requirePlatformAdmin)
  .get(
    "/servers",
    async ({ query }) =>
      serializeData(
        await listServersForPlatform({
          status: query.status,
          organization_id: query.organization_id,
          q: query.q,
          limit: query.limit ?? ADMIN_PAGE_SIZE,
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
  .get(
    "/servers/:id",
    async ({ params, request, set }) => {
      const server = await readServerForPlatform(params.id)

      if (!server) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "server_not_found")
        )
      }

      return { data: serializeData(server) }
    },
    {
      params: serverParams,
      detail: { summary: "Un serveur, son appareil, son droit et son journal" },
      response: {
        200: dataResponse(adminServerDetailSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )

const writeRoutes = new Elysia({ name: "admin-servers-write" })
  .use(requirePlatformRole("admin"))
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
      params: serverParams,
      body: adminReasonBody,
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
  .post(
    "/servers/:id/restore",
    async ({ user, params, request, set }) => {
      const locale = resolveLocale(request.headers)

      try {
        const restored = await restoreServerByAdmin(
          { userId: user.id },
          params.id
        )

        if (!restored) {
          set.status = 404

          return apiError("not_found", translate(locale, "server_not_found"))
        }

        return { data: serializeData(restored) }
      } catch (error) {
        if (!(error instanceof ServerNotAdminSuspendedError)) {
          throw error
        }

        set.status = 409

        return apiError(
          "conflict",
          translate(locale, "server_not_admin_suspended"),
          translate(locale, "server_not_admin_suspended_fix")
        )
      }
    },
    {
      params: serverParams,
      detail: { summary: "Lever une suspension posée par l'équipe" },
      response: {
        200: dataResponse(adminServerDetailSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    }
  )
  .delete(
    "/servers/:id",
    async ({ user, params, body, request, set }) => {
      const deleted = await deleteServerByAdmin(
        { userId: user.id },
        params.id,
        body.reason
      )

      if (!deleted) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "server_not_found")
        )
      }

      if (deleted.deletion === "purged") {
        set.status = 204

        return
      }

      return { data: serializeData(deleted.server) }
    },
    {
      params: serverParams,
      body: adminReasonBody,
      detail: {
        summary:
          "Retirer un serveur avec la raison : révoqué d'abord, effacé au second appel",
      },
      response: {
        200: dataResponse(adminServerDetailSchema),
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )

export const adminServersRoutes = new Elysia({
  name: "admin-servers-routes",
})
  .use(readRoutes)
  .use(writeRoutes)
