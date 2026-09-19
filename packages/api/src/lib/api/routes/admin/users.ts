import { resolveLocale } from "@pupitre/shared/i18n"
import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { Elysia, t } from "elysia"
import { type MessageKey, translate } from "../../../i18n"
import {
  deactivateUserFromPlatform,
  deleteUserFromPlatform,
  EmailAlreadyVerifiedError,
  reactivateUserFromPlatform,
  resendVerificationFromPlatform,
  revokeUserSessionsFromPlatform,
  SoleOwnerError,
  UserActiveError,
  UserAlreadyDeactivatedError,
} from "../../../platform/user-lifecycle"
import {
  banUserFromPlatform,
  listUsersForPlatform,
  PlatformMemberProtectedError,
  readUserForPlatform,
  revokeDeviceFromPlatform,
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
import { adminReasonBody } from "./schemas"

const userParams = t.Object({ id: t.String() })

const userNotFound = (request: Request) =>
  apiError(
    "not_found",
    translate(resolveLocale(request.headers), "user_not_found")
  )

function conflict(request: Request, message: MessageKey) {
  const locale = resolveLocale(request.headers)

  return apiError(
    "conflict",
    translate(locale, message),
    translate(locale, `${message}_fix` as MessageKey)
  )
}

const CONFLICTS: [new (...args: never[]) => Error, MessageKey][] = [
  [PlatformMemberProtectedError, "platform_member_protected"],
  [UserAlreadyDeactivatedError, "user_already_deactivated"],
  [UserActiveError, "user_active"],
  [SoleOwnerError, "sole_owner"],
  [EmailAlreadyVerifiedError, "email_verified"],
]

function conflictKeyOf(error: unknown): MessageKey | null {
  return CONFLICTS.find(([refusal]) => error instanceof refusal)?.[1] ?? null
}

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

const detailResponse = {
  200: dataResponse(adminUserDetailSchema),
  401: errorResponse,
  403: errorResponse,
  404: errorResponse,
  409: errorResponse,
  422: errorResponse,
}

const writeRoutes = new Elysia({ name: "admin-users-write" })
  .use(requirePlatformRole("admin"))
  .post(
    "/users/:id/ban",
    async ({ user, params, body, request, set }) => {
      try {
        const banned = await banUserFromPlatform(
          { userId: user.id },
          params.id,
          body.reason,
          body.until ? new Date(body.until) : null
        )

        if (!banned) {
          set.status = 404

          return userNotFound(request)
        }

        return { data: serializeData(banned) }
      } catch (error) {
        const key = conflictKeyOf(error)

        if (!key) {
          throw error
        }

        set.status = 409

        return conflict(request, key)
      }
    },
    {
      params: userParams,
      body: adminBanBody,
      detail: { summary: "Suspendre un compte, avec la raison et son terme" },
      response: detailResponse,
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
      detail: { summary: "Lever la suspension d'un compte" },
      response: {
        200: dataResponse(adminUserDetailSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
  .post(
    "/users/:id/deactivate",
    async ({ user, params, body, request, set }) => {
      try {
        const deactivated = await deactivateUserFromPlatform(
          { userId: user.id },
          params.id,
          body.reason
        )

        if (!deactivated) {
          set.status = 404

          return userNotFound(request)
        }

        return { data: serializeData(deactivated) }
      } catch (error) {
        const key = conflictKeyOf(error)

        if (!key) {
          throw error
        }

        set.status = 409

        return conflict(request, key)
      }
    },
    {
      params: userParams,
      body: adminReasonBody,
      detail: {
        summary:
          "Désactiver un compte : sessions, appareils et attributions retirés",
      },
      response: detailResponse,
    }
  )
  .post(
    "/users/:id/reactivate",
    async ({ user, params, request, set }) => {
      try {
        const reactivated = await reactivateUserFromPlatform(
          { userId: user.id },
          params.id
        )

        if (!reactivated) {
          set.status = 404

          return userNotFound(request)
        }

        return { data: serializeData(reactivated) }
      } catch (error) {
        const key = conflictKeyOf(error)

        if (!key) {
          throw error
        }

        set.status = 409

        return conflict(request, key)
      }
    },
    {
      params: userParams,
      detail: {
        summary:
          "Réactiver un compte : la désactivation et la suppression programmée tombent",
      },
      response: detailResponse,
    }
  )
  .delete(
    "/users/:id",
    async ({ user, params, body, request, set }) => {
      try {
        const deletion = await deleteUserFromPlatform(
          { userId: user.id },
          params.id,
          body.reason
        )

        if (!deletion) {
          set.status = 404

          return userNotFound(request)
        }

        if (deletion.deletion === "purged") {
          set.status = 204

          return
        }

        return { data: serializeData(deletion.user) }
      } catch (error) {
        const key = conflictKeyOf(error)

        if (!key) {
          throw error
        }

        set.status = 409

        return conflict(request, key)
      }
    },
    {
      params: userParams,
      body: adminReasonBody,
      detail: {
        summary:
          "Programmer la purge d'un compte, puis l'effacer au second appel",
      },
      response: { ...detailResponse, 204: t.Void() },
    }
  )
  .post(
    "/users/:id/sessions/revoke",
    async ({ user, params, request, set }) => {
      const revoked = await revokeUserSessionsFromPlatform(
        { userId: user.id },
        params.id
      )

      if (!revoked) {
        set.status = 404

        return userNotFound(request)
      }

      set.status = 204
    },
    {
      params: userParams,
      detail: { summary: "Révoquer toutes les sessions d'un compte" },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
  .post(
    "/users/:id/verification",
    async ({ params, request, set }) => {
      try {
        const sent = await resendVerificationFromPlatform(params.id)

        if (!sent) {
          set.status = 404

          return userNotFound(request)
        }

        set.status = 204
      } catch (error) {
        const key = conflictKeyOf(error)

        if (!key) {
          throw error
        }

        set.status = 409

        return conflict(request, key)
      }
    },
    {
      params: userParams,
      detail: { summary: "Renvoyer l'email de vérification d'adresse" },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    }
  )
  .delete(
    "/users/:id/devices/:deviceId",
    async ({ user, params, body, request, set }) => {
      const revoked = await revokeDeviceFromPlatform(
        { userId: user.id },
        params.id,
        params.deviceId,
        body.reason
      )

      if (!revoked) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "device_not_found")
        )
      }

      set.status = 204
    },
    {
      params: t.Object({ id: t.String(), deviceId: t.String() }),
      body: adminReasonBody,
      detail: { summary: "Révoquer un appareil d'un compte, avec la raison" },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )

export const adminUsersRoutes = new Elysia({ name: "admin-users-routes" })
  .use(readRoutes)
  .use(writeRoutes)
