import { type Locale, resolveLocale } from "@pupitre/shared/i18n"
import { MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES } from "@pupitre/shared/legal"
import { Elysia, t } from "elysia"
import { translate } from "../../../i18n"
import {
  composeMailThread,
  MailboxCannotReplyError,
  MailboxUnknownError,
  MailSendFailedError,
  MailThreadHasNoMailboxError,
  MailThreadHasNoRecipientError,
  replyToMailThread,
} from "../../../mail/outbound"
import {
  createMailUpload,
  MailAttachmentRefusedError,
} from "../../../mail/uploads"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requirePlatformRole } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  mailComposeBody,
  mailMessageSchema,
  mailReplyBody,
  mailThreadDetailSchema,
  mailUploadBody,
  mailUploadSchema,
} from "./inbox-schemas"

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

/** The provider's own words stay on the failed row and in the Worker log, never in the answer. */
function sendFailure(locale: Locale, error: MailSendFailedError) {
  console.error(
    `[api] inbox: message ${error.messageId} was refused by the sending service`,
    error.reason
  )

  return apiError(
    "internal",
    translate(locale, "mail_send_failed"),
    translate(locale, "mail_send_failed_fix")
  )
}

function noRecipient(locale: Locale) {
  return apiError(
    "conflict",
    translate(locale, "mail_thread_has_no_recipient"),
    translate(locale, "mail_thread_has_no_recipient_fix")
  )
}

function cannotReply(locale: Locale, error: MailboxCannotReplyError) {
  return apiError(
    "conflict",
    translate(locale, "mailbox_cannot_reply", { address: error.address }),
    translate(locale, "mailbox_cannot_reply_fix")
  )
}

export const adminInboxOutboundRoutes = new Elysia({
  name: "admin-inbox-outbound",
})
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

        if (error instanceof MailThreadHasNoMailboxError) {
          set.status = 422

          return apiError(
            "validation",
            translate(locale, "mail_thread_no_mailbox", {
              address: error.address,
            }),
            translate(locale, "mail_thread_no_mailbox_fix", {
              address: error.address,
            })
          )
        }

        if (error instanceof MailboxCannotReplyError) {
          set.status = 409

          return cannotReply(locale, error)
        }

        if (error instanceof MailThreadHasNoRecipientError) {
          set.status = 409

          return noRecipient(locale)
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
      detail: { summary: "Répondre depuis la boîte du fil" },
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

        if (error instanceof MailboxUnknownError) {
          set.status = 422

          return apiError("validation", translate(locale, "mailbox_not_found"))
        }

        if (error instanceof MailboxCannotReplyError) {
          set.status = 409

          return cannotReply(locale, error)
        }

        if (error instanceof MailThreadHasNoRecipientError) {
          set.status = 409

          return noRecipient(locale)
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
      detail: { summary: "Écrire un nouveau message depuis une boîte" },
      response: {
        201: dataResponse(mailThreadDetailSchema, "MailComposed"),
        401: errorResponse,
        403: errorResponse,
        409: errorResponse,
        422: errorResponse,
        502: errorResponse,
      },
    }
  )
