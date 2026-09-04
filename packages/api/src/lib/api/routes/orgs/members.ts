import { Elysia } from "elysia"
import { type Locale, resolveLocale, translate } from "../../../i18n"
import {
  AlreadyMemberError,
  createInvitation,
  listMembers,
} from "../../../orgs/members"
import { type ApiErrorPayload, apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requireOrg, requireRole } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  invitationBody,
  invitationSchema,
  membersSchema,
  organizationParams,
} from "./schemas"

function organizationNotFound(locale: Locale): ApiErrorPayload {
  return apiError("not_found", translate(locale, "organization_not_found"))
}

export const orgsMembersRoutes = new Elysia({ name: "orgs-members-routes" })
  .use(requireOrg)
  .get(
    "/:id/members",
    async ({ organizationId, params, request, set }) => {
      if (params.id !== organizationId) {
        set.status = 404

        return organizationNotFound(resolveLocale(request.headers))
      }

      return { data: serializeData(await listMembers(organizationId)) }
    },
    {
      params: organizationParams,
      detail: { summary: "Les membres et les invitations en attente" },
      response: {
        200: dataResponse(membersSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )

export const orgsInvitationsRoutes = new Elysia({
  name: "orgs-invitations-routes",
})
  .use(requireRole("admin"))
  .post(
    "/:id/invitations",
    async ({ user, organizationId, params, body, request, set }) => {
      const locale = resolveLocale(request.headers)

      if (params.id !== organizationId) {
        set.status = 404

        return organizationNotFound(locale)
      }

      try {
        const invitation = await createInvitation(
          { userId: user.id, organizationId, headers: request.headers },
          body
        )

        set.status = 201

        return { data: serializeData(invitation) }
      } catch (error) {
        if (error instanceof AlreadyMemberError) {
          set.status = 409

          return apiError(
            "conflict",
            translate(locale, "already_a_member"),
            translate(locale, "already_a_member_fix")
          )
        }

        throw error
      }
    },
    {
      params: organizationParams,
      body: invitationBody,
      detail: { summary: "Inviter quelqu'un dans l'organisation" },
      response: {
        201: dataResponse(invitationSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
