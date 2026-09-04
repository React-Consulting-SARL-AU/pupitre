import { Elysia } from "elysia"
import { loadMe } from "../../me/me"
import { errorResponse } from "../openapi-models"
import { requireAuth } from "../plugins/guards"
import { serializeData } from "../prisma"
import { meSchema } from "./me-schemas"

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
