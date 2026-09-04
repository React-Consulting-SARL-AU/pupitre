import { Elysia, t } from "elysia"
import { loadMe, setUserLocale } from "../../me/me"
import { listServersForUser } from "../../servers/servers"
import { errorResponse } from "../openapi-models"
import { requireAuth } from "../plugins/guards"
import { serializeData } from "../prisma"
import { localeInputBody, meSchema, serverForUserSchema } from "./me-schemas"

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
    async ({ user, organizationId, role, body }) => {
      await setUserLocale(user.id, body.locale)

      return serializeData(await loadMe({ user, organizationId, role }))
    },
    {
      body: localeInputBody,
      detail: { summary: "Changer la langue de l'utilisateur connecté" },
      response: { 200: meSchema, 401: errorResponse, 422: errorResponse },
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
