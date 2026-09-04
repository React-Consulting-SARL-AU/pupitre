import { Elysia, t } from "elysia"
import { resolveLocale, translate } from "../../../i18n"
import {
  getServerForOrganization,
  listServersForOrganization,
} from "../../../servers/servers"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requireOrg } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import { serverDetailSchema, serverSchema } from "./schemas"

export const serversListRoutes = new Elysia({ name: "servers-list-routes" })
  .use(requireOrg)
  .get(
    "/servers",
    async ({ organizationId }) => ({
      data: serializeData(await listServersForOrganization(organizationId)),
    }),
    {
      detail: { summary: "Les serveurs de l'organisation active" },
      response: {
        200: t.Object({ data: t.Array(serverSchema) }, { $id: "ServerList" }),
        401: errorResponse,
        403: errorResponse,
      },
    }
  )
  .get(
    "/servers/:id",
    async ({ organizationId, params, request, set }) => {
      const server = await getServerForOrganization(organizationId, params.id)

      if (!server) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "server_not_found")
        )
      }

      return { data: serializeData(server) }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Un serveur, ses métriques et ses événements" },
      response: {
        200: dataResponse(serverDetailSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
