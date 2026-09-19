import { resolveLocale } from "@pupitre/shared/i18n"
import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { Elysia, t } from "elysia"
import { type MessageKey, type MessageParams, translate } from "../../../i18n"
import {
  closeOrganizationFromPlatform,
  deleteOrganizationFromPlatform,
  LastOwnerError,
  NotAMemberError,
  OrganizationAlreadyClosedError,
  OrganizationAlreadySuspendedError,
  OrganizationNotClosedError,
  OrganizationNotSuspendedError,
  PlatformOrganizationProtectedError,
  removeMemberFromPlatform,
  renameOrganizationFromPlatform,
  reopenOrganizationFromPlatform,
  restoreOrganizationFromPlatform,
  SlugEmptyError,
  SlugTakenError,
  suspendOrganizationFromPlatform,
  transferOrganizationFromPlatform,
} from "../../../platform/organization-lifecycle"
import {
  listOrganizationsForPlatform,
  readOrganizationForPlatform,
} from "../../../platform/organizations"
import { type ApiErrorPayload, apiError } from "../../errors"
import {
  dataResponse,
  errorResponse,
  paginatedResponse,
} from "../../openapi-models"
import { requirePlatformAdmin, requirePlatformRole } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  adminOrganizationDetailSchema,
  adminOrganizationRenameBody,
  adminOrganizationSchema,
  adminOrganizationsQuery,
  adminOrganizationTransferBody,
} from "./platform-schemas"
import { adminReasonBody } from "./schemas"

const organizationParams = t.Object({ id: t.String() })

const organizationNotFound = (request: Request) =>
  apiError(
    "not_found",
    translate(resolveLocale(request.headers), "organization_not_found")
  )

const CONFLICTS: [new (...args: never[]) => Error, MessageKey][] = [
  [PlatformOrganizationProtectedError, "platform_organization_protected"],
  [OrganizationAlreadySuspendedError, "organization_already_suspended"],
  [OrganizationNotSuspendedError, "organization_not_suspended"],
  [OrganizationAlreadyClosedError, "organization_already_closed"],
  [OrganizationNotClosedError, "organization_not_closed"],
  [SlugTakenError, "slug_taken"],
  [LastOwnerError, "last_owner"],
]

interface Refusal {
  status: 409 | 422
  body: ApiErrorPayload
}

function refusalOf(request: Request, error: unknown): Refusal | null {
  const locale = resolveLocale(request.headers)

  if (error instanceof SlugEmptyError) {
    return {
      status: 422,
      body: apiError(
        "validation",
        translate(locale, "slug_empty"),
        translate(locale, "slug_empty_fix")
      ),
    }
  }

  const key = CONFLICTS.find(([refused]) => error instanceof refused)?.[1]

  if (!key) {
    return null
  }

  const params: MessageParams =
    error instanceof SlugTakenError ? { slug: error.slug } : {}

  return {
    status: 409,
    body: apiError(
      "conflict",
      translate(locale, key, params),
      translate(locale, `${key}_fix` as MessageKey)
    ),
  }
}

const detailResponse = {
  200: dataResponse(adminOrganizationDetailSchema),
  401: errorResponse,
  403: errorResponse,
  404: errorResponse,
  409: errorResponse,
  422: errorResponse,
}

const readRoutes = new Elysia({ name: "admin-organizations-read" })
  .use(requirePlatformAdmin)
  .get(
    "/organizations",
    async ({ query }) =>
      serializeData(
        await listOrganizationsForPlatform({
          q: query.q,
          state: query.state,
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

        return organizationNotFound(request)
      }

      return { data: serializeData(organization) }
    },
    {
      params: organizationParams,
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

const writeRoutes = new Elysia({ name: "admin-organizations-write" })
  .use(requirePlatformRole("admin"))
  .post(
    "/organizations/:id/suspend",
    async ({ user, params, body, request, set }) => {
      try {
        const suspended = await suspendOrganizationFromPlatform(
          { userId: user.id },
          params.id,
          body.reason
        )

        if (!suspended) {
          set.status = 404

          return organizationNotFound(request)
        }

        return { data: serializeData(suspended) }
      } catch (error) {
        const refused = refusalOf(request, error)

        if (!refused) {
          throw error
        }

        set.status = refused.status

        return refused.body
      }
    },
    {
      params: organizationParams,
      body: adminReasonBody,
      detail: {
        summary: "Suspendre une organisation et toutes ses machines",
      },
      response: detailResponse,
    }
  )
  .post(
    "/organizations/:id/restore",
    async ({ user, params, request, set }) => {
      try {
        const restored = await restoreOrganizationFromPlatform(
          { userId: user.id },
          params.id
        )

        if (!restored) {
          set.status = 404

          return organizationNotFound(request)
        }

        return { data: serializeData(restored) }
      } catch (error) {
        const refused = refusalOf(request, error)

        if (!refused) {
          throw error
        }

        set.status = refused.status

        return refused.body
      }
    },
    {
      params: organizationParams,
      detail: {
        summary:
          "Lever la suspension d'une organisation et rendre ses machines",
      },
      response: detailResponse,
    }
  )
  .post(
    "/organizations/:id/close",
    async ({ user, params, body, request, set }) => {
      try {
        const closed = await closeOrganizationFromPlatform(
          { userId: user.id },
          params.id,
          body.reason
        )

        if (!closed) {
          set.status = 404

          return organizationNotFound(request)
        }

        return { data: serializeData(closed) }
      } catch (error) {
        const refused = refusalOf(request, error)

        if (!refused) {
          throw error
        }

        set.status = refused.status

        return refused.body
      }
    },
    {
      params: organizationParams,
      body: adminReasonBody,
      detail: {
        summary:
          "Fermer une organisation : entrée refusée, abonnement arrêté, machines suspendues",
      },
      response: detailResponse,
    }
  )
  .post(
    "/organizations/:id/reopen",
    async ({ user, params, request, set }) => {
      try {
        const reopened = await reopenOrganizationFromPlatform(
          { userId: user.id },
          params.id
        )

        if (!reopened) {
          set.status = 404

          return organizationNotFound(request)
        }

        return { data: serializeData(reopened) }
      } catch (error) {
        const refused = refusalOf(request, error)

        if (!refused) {
          throw error
        }

        set.status = refused.status

        return refused.body
      }
    },
    {
      params: organizationParams,
      detail: {
        summary:
          "Rouvrir une organisation et annuler sa suppression programmée",
      },
      response: detailResponse,
    }
  )
  .patch(
    "/organizations/:id",
    async ({ user, params, body, request, set }) => {
      try {
        const renamed = await renameOrganizationFromPlatform(
          { userId: user.id },
          params.id,
          body
        )

        if (!renamed) {
          set.status = 404

          return organizationNotFound(request)
        }

        return { data: serializeData(renamed) }
      } catch (error) {
        const refused = refusalOf(request, error)

        if (!refused) {
          throw error
        }

        set.status = refused.status

        return refused.body
      }
    },
    {
      params: organizationParams,
      body: adminOrganizationRenameBody,
      detail: { summary: "Renommer une organisation, ou changer son slug" },
      response: detailResponse,
    }
  )
  .post(
    "/organizations/:id/transfer",
    async ({ user, params, body, request, set }) => {
      try {
        const transferred = await transferOrganizationFromPlatform(
          { userId: user.id },
          params.id,
          body.user_id
        )

        if (!transferred) {
          set.status = 404

          return organizationNotFound(request)
        }

        return { data: serializeData(transferred) }
      } catch (error) {
        if (error instanceof NotAMemberError) {
          set.status = 404

          return apiError(
            "not_found",
            translate(resolveLocale(request.headers), "member_not_found")
          )
        }

        const refused = refusalOf(request, error)

        if (!refused) {
          throw error
        }

        set.status = refused.status

        return refused.body
      }
    },
    {
      params: organizationParams,
      body: adminOrganizationTransferBody,
      detail: {
        summary: "Donner la propriété d'une organisation à l'un de ses membres",
      },
      response: detailResponse,
    }
  )
  .delete(
    "/organizations/:id",
    async ({ user, params, body, request, set }) => {
      try {
        const deletion = await deleteOrganizationFromPlatform(
          { userId: user.id },
          params.id,
          body.reason
        )

        if (!deletion) {
          set.status = 404

          return organizationNotFound(request)
        }

        if (deletion.deletion === "purged") {
          set.status = 204

          return
        }

        return { data: serializeData(deletion.organization) }
      } catch (error) {
        const refused = refusalOf(request, error)

        if (!refused) {
          throw error
        }

        set.status = refused.status

        return refused.body
      }
    },
    {
      params: organizationParams,
      body: adminReasonBody,
      detail: {
        summary:
          "Programmer la purge d'une organisation, puis l'effacer au second appel",
      },
      response: { ...detailResponse, 204: t.Void() },
    }
  )
  .delete(
    "/organizations/:id/members/:userId",
    async ({ user, params, body, request, set }) => {
      try {
        const removed = await removeMemberFromPlatform(
          { userId: user.id },
          params.id,
          params.userId,
          body.reason
        )

        if (!removed) {
          set.status = 404

          return apiError(
            "not_found",
            translate(resolveLocale(request.headers), "member_not_found")
          )
        }

        set.status = 204
      } catch (error) {
        const refused = refusalOf(request, error)

        if (!refused) {
          throw error
        }

        set.status = refused.status

        return refused.body
      }
    },
    {
      params: t.Object({ id: t.String(), userId: t.String() }),
      body: adminReasonBody,
      detail: {
        summary: "Retirer un membre d'une organisation, avec la raison",
      },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )

export const adminOrganizationsRoutes = new Elysia({
  name: "admin-organizations-routes",
})
  .use(readRoutes)
  .use(writeRoutes)
