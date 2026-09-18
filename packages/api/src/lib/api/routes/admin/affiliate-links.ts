import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import {
  AffiliateCodeTakenError,
  createAffiliateLink,
  listAffiliateLinks,
  readAffiliateLink,
  setAffiliateLinkDisabled,
} from "../../../affiliates/affiliates"
import { translate } from "../../../i18n"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requirePlatformAdmin, requirePlatformRole } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  adminAffiliateLinkBody,
  adminAffiliateLinkDetailSchema,
  adminAffiliateLinkPatchBody,
  adminAffiliateLinkSchema,
} from "./affiliate-link-schemas"

const readRoutes = new Elysia({ name: "admin-affiliate-links-read" })
  .use(requirePlatformAdmin)
  .get(
    "/affiliate-links",
    async () => ({ data: serializeData(await listAffiliateLinks()) }),
    {
      detail: {
        summary: "Les liens d'affiliation, du plus récent au plus ancien",
      },
      response: {
        200: t.Object(
          { data: t.Array(adminAffiliateLinkSchema) },
          { $id: "AdminAffiliateLinkList" }
        ),
        401: errorResponse,
        403: errorResponse,
      },
    }
  )
  .get(
    "/affiliate-links/:id",
    async ({ params, request, set }) => {
      const link = await readAffiliateLink(params.id)

      if (!link) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "affiliate_link_not_found")
        )
      }

      return { data: serializeData(link) }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Un lien d'affiliation et les organisations venues par lui",
      },
      response: {
        200: dataResponse(adminAffiliateLinkDetailSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )

const writeRoutes = new Elysia({ name: "admin-affiliate-links-write" })
  .use(requirePlatformRole("admin"))
  .post(
    "/affiliate-links",
    async ({ user, body, request, set }) => {
      try {
        const link = await createAffiliateLink({ userId: user.id }, body)

        set.status = 201

        return { data: serializeData(link) }
      } catch (error) {
        if (!(error instanceof AffiliateCodeTakenError)) {
          throw error
        }

        const locale = resolveLocale(request.headers)

        set.status = 409

        return apiError(
          "conflict",
          translate(locale, "affiliate_code_taken", { code: error.code }),
          translate(locale, "affiliate_code_taken_fix")
        )
      }
    },
    {
      body: adminAffiliateLinkBody,
      detail: { summary: "Créer un lien d'affiliation" },
      response: {
        201: dataResponse(adminAffiliateLinkSchema),
        401: errorResponse,
        403: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
  .patch(
    "/affiliate-links/:id",
    async ({ user, params, body, request, set }) => {
      const link = await setAffiliateLinkDisabled(
        { userId: user.id },
        params.id,
        body.disabled
      )

      if (!link) {
        set.status = 404

        return apiError(
          "not_found",
          translate(resolveLocale(request.headers), "affiliate_link_not_found")
        )
      }

      return { data: serializeData(link) }
    },
    {
      params: t.Object({ id: t.String() }),
      body: adminAffiliateLinkPatchBody,
      detail: { summary: "Désactiver ou réactiver un lien d'affiliation" },
      response: {
        200: dataResponse(adminAffiliateLinkSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )

export const adminAffiliateLinksRoutes = new Elysia({
  name: "admin-affiliate-links-routes",
})
  .use(readRoutes)
  .use(writeRoutes)
