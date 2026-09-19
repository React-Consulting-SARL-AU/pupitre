import { Elysia } from "elysia"
import { searchPlatform } from "../../../platform/search"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requirePlatformAdmin } from "../../plugins/guards"
import { adminSearchQuery, adminSearchSchema } from "./platform-schemas"

export const adminSearchRoutes = new Elysia({
  name: "admin-search-routes",
})
  .use(requirePlatformAdmin)
  .get(
    "/search",
    async ({ query }) => ({ data: await searchPlatform(query.q) }),
    {
      query: adminSearchQuery,
      detail: { summary: "Chercher partout dans la plateforme" },
      response: {
        200: dataResponse(adminSearchSchema),
        401: errorResponse,
        403: errorResponse,
        422: errorResponse,
      },
    }
  )
