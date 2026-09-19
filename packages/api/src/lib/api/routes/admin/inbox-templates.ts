import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import { translate } from "../../../i18n"
import {
  createMailTemplate,
  deleteMailTemplate,
  listMailTemplates,
  MailTemplateMailboxUnknownError,
  updateMailTemplate,
} from "../../../mail/templates"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requirePlatformAdmin, requirePlatformRole } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  mailTemplateBody,
  mailTemplatePatchBody,
  mailTemplateSchema,
  mailTemplatesQuery,
} from "./inbox-schemas"

const templateParams = t.Object({ id: t.String() })

const templateListResponse = t.Object(
  { data: t.Array(mailTemplateSchema) },
  { $id: "MailTemplateList" }
)

function mailboxRefusal(headers: Headers) {
  const locale = resolveLocale(headers)

  return apiError(
    "validation",
    translate(locale, "mail_template_mailbox_unknown"),
    translate(locale, "mail_template_mailbox_unknown_fix")
  )
}

export const adminInboxTemplateReadRoutes = new Elysia({
  name: "admin-inbox-templates-read",
})
  .use(requirePlatformAdmin)
  .get(
    "/templates",
    async ({ query }) => ({
      data: serializeData(await listMailTemplates(query.mailbox_id)),
    }),
    {
      query: mailTemplatesQuery,
      detail: { summary: "Les réponses types, toutes boîtes ou une seule" },
      response: {
        200: templateListResponse,
        401: errorResponse,
        403: errorResponse,
      },
    }
  )

export const adminInboxTemplateWriteRoutes = new Elysia({
  name: "admin-inbox-templates-write",
})
  .use(requirePlatformRole("admin"))
  .post(
    "/templates",
    async ({ user, body, request, set }) => {
      try {
        const template = await createMailTemplate(
          { userId: user.id, source: "console" },
          body
        )

        set.status = 201

        return { data: serializeData(template) }
      } catch (error) {
        if (!(error instanceof MailTemplateMailboxUnknownError)) {
          throw error
        }

        set.status = 422

        return mailboxRefusal(request.headers)
      }
    },
    {
      body: mailTemplateBody,
      detail: { summary: "Écrire une réponse type" },
      response: {
        201: dataResponse(mailTemplateSchema),
        401: errorResponse,
        403: errorResponse,
        422: errorResponse,
      },
    }
  )
  .patch(
    "/templates/:id",
    async ({ user, params, body, request, set }) => {
      try {
        const template = await updateMailTemplate(
          { userId: user.id, source: "console" },
          params.id,
          body
        )

        if (!template) {
          set.status = 404

          return apiError(
            "not_found",
            translate(resolveLocale(request.headers), "mail_template_not_found")
          )
        }

        return { data: serializeData(template) }
      } catch (error) {
        if (!(error instanceof MailTemplateMailboxUnknownError)) {
          throw error
        }

        set.status = 422

        return mailboxRefusal(request.headers)
      }
    },
    {
      params: templateParams,
      body: mailTemplatePatchBody,
      detail: { summary: "Récrire une réponse type" },
      response: {
        200: dataResponse(mailTemplateSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
  .delete(
    "/templates/:id",
    async ({ user, params, request, set }) => {
      const removed = await deleteMailTemplate(
        { userId: user.id, source: "console" },
        params.id
      )

      if (!removed) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "mail_template_not_found")
        )
      }

      set.status = 204
    },
    {
      params: templateParams,
      detail: { summary: "Retirer une réponse type" },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
