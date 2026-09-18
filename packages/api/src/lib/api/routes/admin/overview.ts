import { Elysia } from "elysia"
import { readPlatformOverview } from "../../../platform/overview"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requirePlatformAdmin } from "../../plugins/guards"
import { adminOverviewSchema } from "./platform-schemas"

export const adminOverviewRoutes = new Elysia({
  name: "admin-overview-routes",
})
  .use(requirePlatformAdmin)
  .get("/overview", async () => ({ data: await readPlatformOverview() }), {
    detail: { summary: "Les compteurs de la plateforme" },
    response: {
      200: dataResponse(adminOverviewSchema),
      401: errorResponse,
      403: errorResponse,
    },
  })
