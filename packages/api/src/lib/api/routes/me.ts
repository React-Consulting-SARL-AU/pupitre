import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import { translate } from "../../i18n"
import { loadMe, setActiveOrganization, setUserLocale } from "../../me/me"
import { listServersForUser } from "../../servers/servers"
import { apiError } from "../errors"
import { errorResponse } from "../openapi-models"
import { memberRole } from "../plugins/auth"
import { requireAuth } from "../plugins/guards"
import { serializeData } from "../prisma"
import { meInputBody, meSchema, serverForUserSchema } from "./me-schemas"

export const meRoutes = new Elysia({ name: "me-routes", tags: ["Me"] })
  .use(requireAuth)
  .get(
    "/me",
    async ({ user, organizationId, role }) =>
      serializeData(await loadMe({ user, organizationId, role })),
    {
      detail: {
        summary: "L'utilisateur connecté, ses organisations et son rôle",
      },
      response: { 200: meSchema, 401: errorResponse },
    }
  )
  .patch(
    "/me",
    async ({ user, session, organizationId, role, body, request, set }) => {
      if (body.locale) {
        await setUserLocale(user.id, body.locale)
      }

      let active = organizationId
      let held = role

      if (body.organization_id) {
        const moved = await setActiveOrganization(
          user.id,
          session.id,
          body.organization_id
        )

        if (!moved) {
          set.status = 403

          return apiError(
            "forbidden",
            translate(resolveLocale(request.headers), "organization_forbidden"),
            translate(
              resolveLocale(request.headers),
              "organization_forbidden_fix"
            )
          )
        }

        active = body.organization_id
        held = await memberRole(user.id, body.organization_id)
      }

      return serializeData(
        await loadMe({ user, organizationId: active, role: held })
      )
    },
    {
      body: meInputBody,
      detail: {
        summary: "Changer la langue ou l'organisation active de l'appelant",
      },
      response: {
        200: meSchema,
        401: errorResponse,
        403: errorResponse,
        422: errorResponse,
      },
    }
  )
  .get(
    "/me/servers",
    async ({ user }) => ({
      data: serializeData(await listServersForUser(user.id)),
    }),
    {
      detail: { summary: "Les serveurs assignés à l'utilisateur" },
      response: {
        200: t.Object(
          { data: t.Array(serverForUserSchema) },
          { $id: "ServerForUserList" }
        ),
        401: errorResponse,
      },
    }
  )
