import { type Locale, resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import { translate } from "../../../i18n"
import { AlreadyMemberError } from "../../../orgs/members"
import {
  assignServer,
  DeviceNotFoundError,
  NotAMemberError,
  revokeDeviceOnServer,
  ServerNotFoundError,
  unassignServer,
} from "../../../servers/assign"
import { toServerView } from "../../../servers/servers"
import { type ApiErrorPayload, apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requireRole } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import { assignBody, revokeDeviceBody, serverSchema } from "./schemas"

const serverParams = t.Object({ id: t.String() })

interface Refusal {
  status: 404 | 409
  body: ApiErrorPayload
}

function refusalFor(error: unknown, locale: Locale): Refusal | null {
  if (error instanceof ServerNotFoundError) {
    return {
      status: 404,
      body: apiError("not_found", translate(locale, "server_not_found")),
    }
  }

  if (error instanceof NotAMemberError) {
    return {
      status: 404,
      body: apiError(
        "not_found",
        translate(locale, "assignee_not_a_member"),
        translate(locale, "assignee_not_a_member_fix")
      ),
    }
  }

  if (error instanceof DeviceNotFoundError) {
    return {
      status: 404,
      body: apiError("not_found", translate(locale, "device_not_found")),
    }
  }

  if (error instanceof AlreadyMemberError) {
    return {
      status: 409,
      body: apiError(
        "conflict",
        translate(locale, "already_a_member"),
        translate(locale, "already_a_member_fix")
      ),
    }
  }

  return null
}

export const serversAssignRoutes = new Elysia({ name: "servers-assign-routes" })
  .use(requireRole("admin"))
  .post(
    "/servers/:id/assign",
    async ({ user, organizationId, params, body, request, set }) => {
      const actor = {
        userId: user.id,
        organizationId,
        headers: request.headers,
      }

      try {
        const server = await assignServer(actor, params.id, body)

        return { data: serializeData(toServerView(server)) }
      } catch (error) {
        const refusal = refusalFor(error, resolveLocale(request.headers))

        if (!refusal) {
          throw error
        }

        set.status = refusal.status

        return refusal.body
      }
    },
    {
      params: serverParams,
      body: assignBody,
      detail: {
        summary: "Attribuer un serveur à un membre, ou inviter la personne",
      },
      response: {
        200: dataResponse(serverSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
  .post(
    "/servers/:id/unassign",
    async ({ user, organizationId, params, request, set }) => {
      const actor = {
        userId: user.id,
        organizationId,
        headers: request.headers,
      }

      try {
        const server = await unassignServer(actor, params.id)

        return { data: serializeData(toServerView(server)) }
      } catch (error) {
        const refusal = refusalFor(error, resolveLocale(request.headers))

        if (!refusal) {
          throw error
        }

        set.status = refusal.status

        return refusal.body
      }
    },
    {
      params: serverParams,
      detail: { summary: "Retirer l'attribution d'un serveur et ses clés" },
      response: {
        200: dataResponse(serverSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
  .post(
    "/servers/:id/revoke-device",
    async ({ user, organizationId, params, body, request, set }) => {
      const actor = {
        userId: user.id,
        organizationId,
        headers: request.headers,
      }

      try {
        await revokeDeviceOnServer(actor, params.id, body.device_id)

        set.status = 204

        return
      } catch (error) {
        const refusal = refusalFor(error, resolveLocale(request.headers))

        if (!refusal) {
          throw error
        }

        set.status = refusal.status

        return refusal.body
      }
    },
    {
      params: serverParams,
      body: revokeDeviceBody,
      detail: { summary: "Retirer la clé d'un appareil de ce serveur" },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
