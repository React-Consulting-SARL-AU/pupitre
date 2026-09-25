import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import { forgetBackup } from "../../../backups/backups"
import { translate } from "../../../i18n"
import { apiError } from "../../errors"
import { errorResponse } from "../../openapi-models"
import { requireRole } from "../../plugins/guards"

export const backupsForgetRoutes = new Elysia({ name: "backups-forget-routes" })
  .use(requireRole("admin"))
  .post(
    "/backups/:id/forget",
    async ({ user, organizationId, role, params, request, set }) => {
      const forgotten = await forgetBackup(organizationId, params.id, {
        userId: user.id,
        role,
      })

      if (!forgotten) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "backup_not_found")
        )
      }

      set.status = 204
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Oublier une sauvegarde sans toucher au bucket" },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
