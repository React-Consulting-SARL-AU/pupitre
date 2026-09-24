import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import {
  BackupIdTakenError,
  declareBackup,
  removeBackup,
} from "../../../backups/backups"
import { translate } from "../../../i18n"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requireServer } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import { backupDeclarationBody, backupSchema } from "../backups/schemas"

export const agentBackupsRoutes = new Elysia({ name: "agent-backups-routes" })
  .use(requireServer)
  .post(
    "/agent/backups",
    async ({ currentServer, body, request, set }) => {
      try {
        const { backup, created } = await declareBackup(currentServer, body)

        if (created) {
          set.status = 201
        }

        return { data: serializeData(backup) }
      } catch (error) {
        if (error instanceof BackupIdTakenError) {
          const locale = resolveLocale(request.headers)

          set.status = 409
          return apiError(
            "conflict",
            translate(locale, "backup_id_taken", { id: body.id }),
            translate(locale, "backup_id_taken_fix")
          )
        }

        throw error
      }
    },
    {
      body: backupDeclarationBody,
      detail: { summary: "Déclarer une sauvegarde écrite dans le seau" },
      response: {
        200: dataResponse(backupSchema),
        201: dataResponse(backupSchema),
        401: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
  .delete(
    "/agent/backups/:id",
    async ({ currentServer, params, request, set }) => {
      const removed = await removeBackup(currentServer, params.id)

      if (!removed) {
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
      detail: { summary: "Retirer la référence d'une sauvegarde effacée" },
      response: { 204: t.Void(), 401: errorResponse, 404: errorResponse },
    }
  )
