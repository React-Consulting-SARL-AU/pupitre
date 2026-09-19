import { resolveLocale } from "@pupitre/shared/i18n"
import { MAIL_DOMAIN } from "@pupitre/shared/legal"
import { Elysia, t } from "elysia"
import { translate } from "../../../i18n"
import {
  countMailboxes,
  createMailbox,
  deleteMailbox,
  listMailboxes,
  MailboxAddressRefusedError,
  MailboxInUseError,
  MailboxProtectedError,
  MailboxTakenError,
  updateMailbox,
} from "../../../mail/mailboxes"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requirePlatformAdmin, requirePlatformRole } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  mailboxCreateBody,
  mailboxPatchBody,
  mailCountsSchema,
  mailMailboxSchema,
} from "./inbox-schemas"

const mailboxListResponse = t.Object(
  { data: t.Array(mailMailboxSchema) },
  { $id: "MailMailboxList" }
)

export const adminInboxMailboxReadRoutes = new Elysia({
  name: "admin-inbox-mailboxes-read",
})
  .use(requirePlatformAdmin)
  .get(
    "/mailboxes",
    async () => ({ data: serializeData(await listMailboxes()) }),
    {
      detail: { summary: "Les boîtes déclarées, dans l'ordre du rail" },
      response: {
        200: mailboxListResponse,
        401: errorResponse,
        403: errorResponse,
      },
    }
  )
  .get(
    "/counts",
    async () => ({ data: serializeData(await countMailboxes()) }),
    {
      detail: { summary: "Les non-lus et les fils ouverts, boîte par boîte" },
      response: {
        200: dataResponse(mailCountsSchema),
        401: errorResponse,
        403: errorResponse,
      },
    }
  )

export const adminInboxMailboxWriteRoutes = new Elysia({
  name: "admin-inbox-mailboxes-write",
})
  .use(requirePlatformRole("admin"))
  .post(
    "/mailboxes",
    async ({ user, body, request, set }) => {
      const locale = resolveLocale(request.headers)

      try {
        const mailbox = await createMailbox(
          { userId: user.id, source: "console" },
          body
        )

        set.status = 201

        return { data: serializeData(mailbox) }
      } catch (error) {
        if (error instanceof MailboxAddressRefusedError) {
          set.status = 422

          return apiError(
            "validation",
            translate(locale, "mailbox_address_refused", {
              address: error.address,
              domain: MAIL_DOMAIN,
            }),
            translate(locale, "mailbox_address_refused_fix", {
              domain: MAIL_DOMAIN,
            })
          )
        }

        if (error instanceof MailboxTakenError) {
          set.status = 409

          return apiError(
            "conflict",
            translate(locale, "mailbox_taken", { address: error.address }),
            translate(locale, "mailbox_taken_fix")
          )
        }

        throw error
      }
    },
    {
      body: mailboxCreateBody,
      detail: {
        summary: "Ouvrir une boîte, et lui rattacher les fils déjà reçus",
      },
      response: {
        201: dataResponse(mailMailboxSchema),
        401: errorResponse,
        403: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
  .patch(
    "/mailboxes/:id",
    async ({ user, params, body, request, set }) => {
      const mailbox = await updateMailbox(
        { userId: user.id, source: "console" },
        params.id,
        body
      )

      if (!mailbox) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "mailbox_not_found")
        )
      }

      return { data: serializeData(mailbox) }
    },
    {
      params: t.Object({ id: t.String() }),
      body: mailboxPatchBody,
      detail: { summary: "Renommer, signer, désactiver ou ranger une boîte" },
      response: {
        200: dataResponse(mailMailboxSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
  .delete(
    "/mailboxes/:id",
    async ({ user, params, request, set }) => {
      const locale = resolveLocale(request.headers)

      try {
        const removed = await deleteMailbox(
          { userId: user.id, source: "console" },
          params.id
        )

        if (!removed) {
          set.status = 404

          return apiError("not_found", translate(locale, "mailbox_not_found"))
        }

        set.status = 204

        return
      } catch (error) {
        if (error instanceof MailboxProtectedError) {
          set.status = 409

          return apiError(
            "conflict",
            translate(locale, "mailbox_protected"),
            translate(locale, "mailbox_protected_fix")
          )
        }

        if (error instanceof MailboxInUseError) {
          set.status = 409

          return apiError(
            "conflict",
            translate(locale, "mailbox_in_use", { threads: error.threads }),
            translate(locale, "mailbox_in_use_fix")
          )
        }

        throw error
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Supprimer une boîte qui ne porte aucun fil" },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    }
  )
