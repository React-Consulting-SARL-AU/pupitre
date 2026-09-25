import { type Locale, resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import { recordEvent } from "../../../audit/audit"
import { translate } from "../../../i18n"
import { MAIL_HTML_CSP, MAIL_NOSNIFF } from "../../../mail/html"
import { mailAttachmentUrl, readMailMessageHtml } from "../../../mail/objects"
import {
  attachmentOrigin,
  noteSensitiveThreadRead,
  readMailThread,
} from "../../../mail/thread-detail"
import {
  bulkUpdateMailThreads,
  MailAssigneeNotOnTheTeamError,
  MailOrganizationUnknownError,
  updateMailThread,
} from "../../../mail/thread-mutations"
import { listMailThreads, MAIL_PAGE_SIZE } from "../../../mail/threads"
import { actsOnPlatform } from "../../../platform/actor"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requirePlatformAdmin } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  mailAttachmentUrlQuery,
  mailAttachmentUrlSchema,
  mailBulkBody,
  mailBulkSchema,
  mailThreadDetailSchema,
  mailThreadPatchBody,
  mailThreadSchema,
  mailThreadsQuery,
} from "./inbox-schemas"

const threadListResponse = t.Object(
  {
    data: t.Array(mailThreadSchema),
    total: t.Integer(),
    unread: t.Integer(),
  },
  { $id: "MailThreadList" }
)

function roleRefusal(locale: Locale) {
  return apiError(
    "forbidden",
    translate(locale, "platform_role_required", { role: "admin" })
  )
}

export const adminInboxThreadRoutes = new Elysia({
  name: "admin-inbox-threads",
})
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
          mailboxId: query.mailbox_id,
          organizationId: query.organization_id,
          automated: query.automated,
          assigned: query.assigned,
          sort: query.sort,
          direction: query.direction,
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
    async ({ user, params, request, set }) => {
      const thread = await readMailThread(params.id)

      if (!thread) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "mail_thread_not_found")
        )
      }

      await noteSensitiveThreadRead(
        { userId: user.id, source: "console" },
        thread
      )

      return { data: serializeData(thread) }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary:
          "Un fil, ses messages, ses notes, son activité et son brouillon",
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
    async ({ user, params, query, request, set }) => {
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

      const origin = await attachmentOrigin(params.id)

      if (origin?.sensitive) {
        await recordEvent({
          action: "mail.attachment_read",
          actorUserId: user.id,
          targetType: "mail_thread",
          targetId: origin.threadId,
          payload: { attachment_id: params.id },
        })
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
  .patch(
    "/threads/:id",
    async ({ user, platformRole, params, body, request, set }) => {
      const locale = resolveLocale(request.headers)
      const acts =
        body.status !== undefined ||
        body.assigned_user_id !== undefined ||
        body.linked_organization_id !== undefined

      if (acts && !actsOnPlatform(platformRole)) {
        set.status = 403

        return roleRefusal(locale)
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
        if (error instanceof MailAssigneeNotOnTheTeamError) {
          set.status = 422

          return apiError(
            "validation",
            translate(locale, "mail_assignee_not_on_the_team"),
            translate(locale, "mail_assignee_not_on_the_team_fix")
          )
        }

        if (error instanceof MailOrganizationUnknownError) {
          set.status = 422

          return apiError(
            "validation",
            translate(locale, "mail_organization_unknown"),
            translate(locale, "mail_organization_unknown_fix")
          )
        }

        throw error
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: mailThreadPatchBody,
      detail: {
        summary: "Marquer lu, fermer, rouvrir, attribuer ou lier un fil",
      },
      response: {
        200: dataResponse(mailThreadDetailSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
  .post(
    "/threads/bulk",
    async ({ user, platformRole, body, request, set }) => {
      if (body.status !== undefined && !actsOnPlatform(platformRole)) {
        set.status = 403

        return roleRefusal(resolveLocale(request.headers))
      }

      const updated = await bulkUpdateMailThreads(
        { userId: user.id, source: "console" },
        body.ids,
        { status: body.status, unread: body.unread }
      )

      return { data: { updated } }
    },
    {
      body: mailBulkBody,
      detail: { summary: "Clore, rouvrir ou marquer plusieurs fils d'un coup" },
      response: {
        200: dataResponse(mailBulkSchema),
        401: errorResponse,
        403: errorResponse,
        422: errorResponse,
      },
    }
  )
