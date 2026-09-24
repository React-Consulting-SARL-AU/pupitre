import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import {
  listBackups,
  listServerBackups,
  recordBackupRestored,
} from "../../../backups/backups"
import { translate } from "../../../i18n"
import { apiError } from "../../errors"
import { errorResponse } from "../../openapi-models"
import { requireOrg } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import { backupSchema, restoredBody } from "./schemas"

const backupList = t.Object(
  { data: t.Array(backupSchema) },
  { $id: "BackupList" }
)

export const backupsListRoutes = new Elysia({ name: "backups-list-routes" })
  .use(requireOrg)
  .get(
    "/backups",
    async ({ user, organizationId, role }) => ({
      data: serializeData(
        await listBackups(organizationId, { userId: user.id, role })
      ),
    }),
    {
      detail: { summary: "Les sauvegardes de l'organisation active" },
      response: { 200: backupList, 401: errorResponse, 403: errorResponse },
    }
  )
  .get(
    "/servers/:id/backups",
    async ({ user, organizationId, role, params, request, set }) => {
      const backups = await listServerBackups(organizationId, params.id, {
        userId: user.id,
        role,
      })

      if (!backups) {
        set.status = 404
        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "server_not_found")
        )
      }

      return { data: serializeData(backups) }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Les sauvegardes d'un serveur" },
      response: {
        200: backupList,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
  .post(
    "/backups/:id/restored",
    async ({ user, organizationId, role, params, body, request, set }) => {
      const recorded = await recordBackupRestored(
        organizationId,
        params.id,
        body.server_id,
        { userId: user.id, role }
      )

      if (!recorded) {
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
      body: restoredBody,
      detail: { summary: "Noter qu'une sauvegarde a été restaurée" },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
