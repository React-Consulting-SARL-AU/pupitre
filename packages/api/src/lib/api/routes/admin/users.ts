import { resolveLocale } from "@pupitre/shared/i18n"
import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { Elysia, t } from "elysia"
import { translate } from "../../../i18n"
import {
  banUserFromPlatform,
  listUsersForPlatform,
  PlatformMemberProtectedError,
  readUserForPlatform,
  unbanUserFromPlatform,
} from "../../../platform/users"
import { apiError } from "../../errors"
import {
  dataResponse,
  errorResponse,
  paginatedResponse,
} from "../../openapi-models"
import { requirePlatformAdmin, requirePlatformRole } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  adminBanBody,
  adminUserDetailSchema,
  adminUserSchema,
  adminUsersQuery,
} from "./platform-schemas"

const userParams = t.Object({ id: t.String() })

const userNotFound = (request: Request) =>
  apiError(
    "not_found",
    translate(resolveLocale(request.headers), "user_not_found")
  )

const readRoutes = new Elysia({ name: "admin-users-read" })
  .use(requirePlatformAdmin)
  .get(
    "/users",
    async ({ query }) =>
      serializeData(
        await listUsersForPlatform({
          q: query.q,
          limit: query.limit ?? ADMIN_PAGE_SIZE,
          offset: query.offset ?? 0,
        })
      ),
    {
      query: adminUsersQuery,
      detail: {
        summary: "Les comptes de la plateforme, avec leurs organisations",
      },
      response: {
        200: paginatedResponse(adminUserSchema),
        401: errorResponse,
        403: errorResponse,
        422: errorResponse,
      },
    }
  )
  .get(
    "/users/:id",
    async ({ params, request, set }) => {
      const user = await readUserForPlatform(params.id)

      if (!user) {
        set.status = 404

        return userNotFound(request)
      }

      return { data: serializeData(user) }
    },
    {
      params: userParams,
      detail: {
        summary: "Un compte, ses appareils, ses serveurs et son journal",
      },
      response: {
        200: dataResponse(adminUserDetailSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )

const writeRoutes = new Elysia({ name: "admin-users-write" })
  .use(requirePlatformRole("admin"))
  .post(
    "/users/:id/ban",
    async ({ user, params, body, request, set }) => {
      try {
        const banned = await banUserFromPlatform(
          { userId: user.id },
          params.id,
          body.reason
        )

        if (!banned) {
          set.status = 404

          return userNotFound(request)
        }

        return { data: serializeData(banned) }
      } catch (error) {
        if (!(error instanceof PlatformMemberProtectedError)) {
          throw error
        }

        const locale = resolveLocale(request.headers)

        set.status = 409

        return apiError(
          "conflict",
          translate(locale, "platform_member_protected"),
          translate(locale, "platform_member_protected_fix")
        )
      }
    },
    {
      params: userParams,
      body: adminBanBody,
      detail: { summary: "Bannir un compte, avec la raison" },
      response: {
        200: dataResponse(adminUserDetailSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
  .post(
    "/users/:id/unban",
    async ({ user, params, request, set }) => {
      const restored = await unbanUserFromPlatform(
        { userId: user.id },
        params.id
      )

      if (!restored) {
        set.status = 404

        return userNotFound(request)
      }

      return { data: serializeData(restored) }
    },
    {
      params: userParams,
      detail: { summary: "Lever le bannissement d'un compte" },
      response: {
        200: dataResponse(adminUserDetailSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )

export const adminUsersRoutes = new Elysia({ name: "admin-users-routes" })
  .use(readRoutes)
  .use(writeRoutes)
