import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import { translate } from "../../../i18n"
import {
  deleteMailDraft,
  readMailDraft,
  saveMailDraft,
} from "../../../mail/drafts"
import {
  createMailNote,
  deleteMailNote,
  listMailNotes,
  MailNoteNotYoursError,
} from "../../../mail/notes"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { ROLE_RANK, requirePlatformAdmin } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  mailDraftBody,
  mailDraftSchema,
  mailNoteBody,
  mailNoteSchema,
} from "./inbox-schemas"

const threadParams = t.Object({ id: t.String() })

const noteParams = t.Object({ id: t.String(), noteId: t.String() })

const noteListResponse = t.Object(
  { data: t.Array(mailNoteSchema) },
  { $id: "MailNoteList" }
)

export const adminInboxNoteRoutes = new Elysia({ name: "admin-inbox-notes" })
  .use(requirePlatformAdmin)
  .get(
    "/threads/:id/notes",
    async ({ params }) => ({
      data: serializeData(await listMailNotes(params.id)),
    }),
    {
      params: threadParams,
      detail: { summary: "Les notes internes d'un fil" },
      response: {
        200: noteListResponse,
        401: errorResponse,
        403: errorResponse,
      },
    }
  )
  .post(
    "/threads/:id/notes",
    async ({ user, params, body, request, set }) => {
      const note = await createMailNote(
        { userId: user.id, source: "console" },
        params.id,
        body.body
      )

      if (!note) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "mail_thread_not_found")
        )
      }

      set.status = 201

      return { data: serializeData(note) }
    },
    {
      params: threadParams,
      body: mailNoteBody,
      detail: { summary: "Écrire une note interne sur un fil" },
      response: {
        201: dataResponse(mailNoteSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
  .delete(
    "/threads/:id/notes/:noteId",
    async ({ user, platformRole, params, request, set }) => {
      const locale = resolveLocale(request.headers)
      const mayDeleteAnyone =
        ROLE_RANK[(platformRole ?? "member") as "member"] >= ROLE_RANK.admin

      try {
        const removed = await deleteMailNote(
          { userId: user.id, source: "console" },
          params.id,
          params.noteId,
          mayDeleteAnyone
        )

        if (!removed) {
          set.status = 404

          return apiError("not_found", translate(locale, "mail_note_not_found"))
        }

        set.status = 204

        return
      } catch (error) {
        if (!(error instanceof MailNoteNotYoursError)) {
          throw error
        }

        set.status = 403

        return apiError(
          "forbidden",
          translate(locale, "mail_note_not_yours"),
          translate(locale, "mail_note_not_yours_fix")
        )
      }
    },
    {
      params: noteParams,
      detail: { summary: "Retirer une note interne" },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
  .get(
    "/threads/:id/draft",
    async ({ params, request, set }) => {
      const draft = await readMailDraft(params.id)

      if (!draft) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "mail_draft_not_found")
        )
      }

      return { data: serializeData(draft) }
    },
    {
      params: threadParams,
      detail: { summary: "Le brouillon de réponse gardé sur un fil" },
      response: {
        200: dataResponse(mailDraftSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
  .put(
    "/threads/:id/draft",
    async ({ user, params, body, request, set }) => {
      const draft = await saveMailDraft(
        { userId: user.id, source: "console" },
        params.id,
        body
      )

      if (!draft) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "mail_thread_not_found")
        )
      }

      return { data: serializeData(draft) }
    },
    {
      params: threadParams,
      body: mailDraftBody,
      detail: { summary: "Garder le brouillon de réponse d'un fil" },
      response: {
        200: dataResponse(mailDraftSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
  .delete(
    "/threads/:id/draft",
    async ({ params, request, set }) => {
      const removed = await deleteMailDraft(params.id)

      if (!removed) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "mail_draft_not_found")
        )
      }

      set.status = 204
    },
    {
      params: threadParams,
      detail: { summary: "Jeter le brouillon de réponse d'un fil" },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
