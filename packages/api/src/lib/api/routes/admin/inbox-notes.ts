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
} from "../../../mail/notes"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requirePlatformAdmin, requirePlatformRole } from "../../plugins/guards"
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

export const adminInboxNoteReadRoutes = new Elysia({
  name: "admin-inbox-notes-read",
})
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

export const adminInboxNoteWriteRoutes = new Elysia({
  name: "admin-inbox-notes-write",
})
  .use(requirePlatformRole("admin"))
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
    async ({ user, params, request, set }) => {
      const removed = await deleteMailNote(
        { userId: user.id, source: "console" },
        params.id,
        params.noteId
      )

      if (!removed) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "mail_note_not_found")
        )
      }

      set.status = 204
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
