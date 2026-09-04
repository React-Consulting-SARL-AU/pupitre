import { Elysia, t } from "elysia"
import { resolveLocale, translate } from "../../../i18n"
import { deleteServerForOrganization } from "../../../servers/servers"
import { apiError } from "../../errors"
import { errorResponse } from "../../openapi-models"
import { requireRole } from "../../plugins/guards"

export const serversRemoveRoutes = new Elysia({ name: "servers-remove-routes" })
  .use(requireRole("admin"))
  .delete(
    "/servers/:id",
    async ({ user, organizationId, params, request, set }) => {
      const deleted = await deleteServerForOrganization(
        { userId: user.id, organizationId },
        params.id
      )

      if (!deleted) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "server_not_found")
        )
      }

      set.status = 204
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Retirer un serveur, décommission programmée à sept jours",
      },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
