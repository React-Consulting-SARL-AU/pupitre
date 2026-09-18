import { type Locale, resolveLocale } from "@pupitre/shared/i18n"
import {
  MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES,
  MAIL_SENDER_ADDRESSES,
} from "@pupitre/shared/legal"
import { Elysia, t } from "elysia"
import { translate } from "../../../i18n"
import { MAIL_HTML_CSP, MAIL_NOSNIFF } from "../../../mail/html"
import { mailAttachmentUrl, readMailMessageHtml } from "../../../mail/objects"
import {
  composeMailThread,
  MailSendFailedError,
  MailThreadHasNoRecipientError,
  replyToMailThread,
} from "../../../mail/outbound"
import {
  listMailThreads,
  MAIL_PAGE_SIZE,
  MailAssigneeNotOnTheTeamError,
  readMailThread,
  updateMailThread,
} from "../../../mail/threads"
import {
  createMailUpload,
  MailAttachmentRefusedError,
} from "../../../mail/uploads"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import {
  ROLE_RANK,
  requirePlatformAdmin,
  requirePlatformRole,
} from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  mailAttachmentUrlQuery,
  mailAttachmentUrlSchema,
  mailComposeBody,
  mailMessageSchema,
  mailReplyBody,
  mailThreadDetailSchema,
  mailThreadPatchBody,
  mailThreadSchema,
  mailThreadsQuery,
  mailUploadBody,
  mailUploadSchema,
} from "./inbox-schemas"

const threadListResponse = t.Object(
  {
    data: t.Array(mailThreadSchema),
    total: t.Integer(),
    unread: t.Integer(),
  },
  { $id: "MailThreadList" }
)

const MIB = 1024 * 1024

const REFUSAL_KEYS = {
  blocked: "mail_attachment_blocked",
  too_large: "mail_attachments_too_large",
  missing: "mail_upload_missing",
  foreign: "mail_upload_foreign",
  size_mismatch: "mail_upload_size_mismatch",
} as const

function attachmentRefusal(locale: Locale, error: MailAttachmentRefusedError) {
  const key = REFUSAL_KEYS[error.reason]
  const params = {
    filename: error.filename,
    limit: MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES / MIB,
  }

  return apiError(
    "validation",
    translate(locale, key, params),
    translate(locale, `${key}_fix`, params)
  )
}

function sendFailure(locale: Locale, error: MailSendFailedError) {
  return apiError(
    "internal",
    translate(locale, "mail_send_failed", { reason: error.reason }),
    translate(locale, "mail_send_failed_fix")
  )
}

const readRoutes = new Elysia({ name: "admin-inbox-read" })
  .use(requirePlatformAdmin)
  .get(
    "/threads",
    async ({ user, query }) =>
      serializeData(
        await listMailThreads({
          viewerId: user.id,
          status: query.status,
          unread: query.unread,
          q: query.q,
          address: query.address,
          assigned: query.assigned,
          limit: query.limit ?? MAIL_PAGE_SIZE,
          offset: query.offset ?? 0,
        })
      ),
    {
      query: mailThreadsQuery,
      detail: { summary: "Les fils de la boîte, le plus récent en tête" },
      response: {
        200: threadListResponse,
        401: errorResponse,
        403: errorResponse,
        422: errorResponse,
      },
    }
  )
  .get(
    "/threads/:id",
    async ({ params, request, set }) => {
      const thread = await readMailThread(params.id)

      if (!thread) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "mail_thread_not_found")
        )
      }

      return { data: serializeData(thread) }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Un fil et tous ses messages, du plus ancien au plus récent",
      },
      response: {
        200: dataResponse(mailThreadDetailSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
  .get(
    "/messages/:id/html",
    async ({ params, request, set }) => {
      const html = await readMailMessageHtml(params.id)

      if (html === null) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "mail_html_not_found")
        )
      }

      set.headers["content-type"] = "text/html; charset=utf-8"
      set.headers["content-security-policy"] = MAIL_HTML_CSP
      set.headers["x-content-type-options"] = MAIL_NOSNIFF

      return html
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Le corps HTML d'un message, désarmé et sous CSP" },
      response: {
        200: t.String(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
  .get(
    "/attachments/:id/url",
    async ({ params, query, request, set }) => {
      const attachment = await mailAttachmentUrl(
        params.id,
        query.disposition ?? "attachment"
      )

      if (!attachment) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "mail_attachment_not_found")
        )
      }

      return { data: serializeData(attachment) }
    },
    {
      params: t.Object({ id: t.String() }),
      query: mailAttachmentUrlQuery,
      detail: {
        summary:
          "Une adresse signée vers les octets d'une pièce jointe, dix minutes",
      },
      response: {
        200: dataResponse(mailAttachmentUrlSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
  .get("/addresses", () => ({ data: [...MAIL_SENDER_ADDRESSES] }), {
    detail: { summary: "Les adresses d'expédition vérifiées" },
    response: {
      200: t.Object({ data: t.Array(t.String()) }, { $id: "MailAddresses" }),
      401: errorResponse,
      403: errorResponse,
    },
  })
  .patch(
    "/threads/:id",
    async ({ user, platformRole, params, body, request, set }) => {
      const locale = resolveLocale(request.headers)
      const acts =
        body.status !== undefined || body.assigned_user_id !== undefined

      if (acts && ROLE_RANK[platformRole ?? "member"] < ROLE_RANK.admin) {
        set.status = 403

        return apiError(
          "forbidden",
          translate(locale, "platform_role_required", { role: "admin" })
        )
      }

      try {
        const thread = await updateMailThread(
          { userId: user.id, source: "console" },
          params.id,
          body
        )

        if (!thread) {
          set.status = 404

          return apiError(
            "not_found",
            translate(locale, "mail_thread_not_found")
          )
        }

        return { data: serializeData(thread) }
      } catch (error) {
        if (!(error instanceof MailAssigneeNotOnTheTeamError)) {
          throw error
        }

        set.status = 422

        return apiError(
          "validation",
          translate(locale, "mail_assignee_not_on_the_team"),
          translate(locale, "mail_assignee_not_on_the_team_fix")
        )
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: mailThreadPatchBody,
      detail: { summary: "Marquer lu, fermer, rouvrir ou attribuer un fil" },
      response: {
        200: dataResponse(mailThreadDetailSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )

const writeRoutes = new Elysia({ name: "admin-inbox-write" })
  .use(requirePlatformRole("admin"))
  .post(
    "/uploads",
    async ({ user, body, request, set }) => {
      try {
        const grant = await createMailUpload(user.id, body)

        set.status = 201

        return { data: serializeData(grant) }
      } catch (error) {
        if (!(error instanceof MailAttachmentRefusedError)) {
          throw error
        }

        set.status = 422

        return attachmentRefusal(resolveLocale(request.headers), error)
      }
    },
    {
      body: mailUploadBody,
      detail: {
        summary: "Une adresse signée où déposer une pièce jointe à envoyer",
      },
      response: {
        201: dataResponse(mailUploadSchema),
        401: errorResponse,
        403: errorResponse,
        422: errorResponse,
      },
    }
  )
  .post(
    "/threads/:id/reply",
    async ({ user, params, body, request, set }) => {
      const locale = resolveLocale(request.headers)

      try {
        const message = await replyToMailThread(
          { userId: user.id, source: "console" },
          params.id,
          body
        )

        if (!message) {
          set.status = 404

          return apiError(
            "not_found",
            translate(locale, "mail_thread_not_found")
          )
        }

        set.status = 201

        return { data: serializeData(message) }
      } catch (error) {
        if (error instanceof MailAttachmentRefusedError) {
          set.status = 422

          return attachmentRefusal(locale, error)
        }

        if (error instanceof MailThreadHasNoRecipientError) {
          set.status = 409

          return apiError(
            "conflict",
            translate(locale, "mail_thread_has_no_recipient"),
            translate(locale, "mail_thread_has_no_recipient_fix")
          )
        }

        if (error instanceof MailSendFailedError) {
          set.status = 502

          return sendFailure(locale, error)
        }

        throw error
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: mailReplyBody,
      detail: { summary: "Répondre au dernier message reçu du fil" },
      response: {
        201: dataResponse(mailMessageSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        422: errorResponse,
        502: errorResponse,
      },
    }
  )
  .post(
    "/compose",
    async ({ user, body, request, set }) => {
      const locale = resolveLocale(request.headers)

      try {
        const thread = await composeMailThread(
          { userId: user.id, source: "console" },
          body
        )

        set.status = 201

        return { data: serializeData(thread) }
      } catch (error) {
        if (error instanceof MailAttachmentRefusedError) {
          set.status = 422

          return attachmentRefusal(locale, error)
        }

        if (error instanceof MailSendFailedError) {
          set.status = 502

          return sendFailure(locale, error)
        }

        throw error
      }
    },
    {
      body: mailComposeBody,
      detail: {
        summary: "Écrire un nouveau message depuis une adresse vérifiée",
      },
      response: {
        201: dataResponse(mailThreadDetailSchema, "MailComposed"),
        401: errorResponse,
        403: errorResponse,
        422: errorResponse,
        502: errorResponse,
      },
    }
  )

export const adminInboxRoutes = new Elysia({
  name: "admin-inbox-routes",
  prefix: "/inbox",
})
  .use(readRoutes)
  .use(writeRoutes)
