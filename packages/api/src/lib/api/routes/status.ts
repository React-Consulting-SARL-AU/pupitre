import { Elysia } from "elysia"
import { readServiceStatus } from "../../status/status"
import { dataResponse } from "../openapi-models"
import { serializeData } from "../prisma"
import { serviceStatusSchema } from "./status-schemas"

export const statusRoutes = new Elysia({
  name: "status-routes",
  tags: ["Status"],
}).get(
  "/status",
  async () => ({ data: serializeData(await readServiceStatus()) }),
  {
    detail: {
      summary: "L'état du service, sans aucune donnée client",
    },
    response: { 200: dataResponse(serviceStatusSchema) },
  }
)
