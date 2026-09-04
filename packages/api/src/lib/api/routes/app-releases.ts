import { Elysia } from "elysia"
import { resolveLocale, translate } from "../../i18n"
import { findAppRelease, latestAppRelease } from "../../releases/app-releases"
import { apiError } from "../errors"
import { dataResponse, errorResponse } from "../openapi-models"
import { requireAuth } from "../plugins/guards"
import { serializeData } from "../prisma"
import {
  appReleaseSchema,
  appReleaseVersionParams,
  latestAppReleaseQuery,
} from "./app-release-schemas"

const appReleaseEnvelope = dataResponse(appReleaseSchema)

export const appReleasesRoutes = new Elysia({
  name: "app-releases-routes",
  tags: ["Releases"],
})
  .use(requireAuth)
  .get(
    "/releases/app/latest",
    async ({ query, request, set }) => {
      const release = await latestAppRelease(query.channel ?? "stable")

      if (!release) {
        const locale = resolveLocale(request.headers)

        set.status = 404

        return apiError(
          "app_release_not_found",
          translate(locale, "app_release_not_found"),
          translate(locale, "app_release_not_found_fix")
        )
      }

      return { data: serializeData(release) }
    },
    {
      query: latestAppReleaseQuery,
      detail: { summary: "La dernière version de l'app d'un canal" },
      response: {
        200: appReleaseEnvelope,
        401: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
  .get(
    "/releases/app/:version",
    async ({ params, request, set }) => {
      const release = await findAppRelease(params.version)

      if (!release) {
        const locale = resolveLocale(request.headers)

        set.status = 404

        return apiError(
          "app_release_not_found",
          translate(locale, "app_release_not_found"),
          translate(locale, "app_release_not_found_fix")
        )
      }

      return { data: serializeData(release) }
    },
    {
      params: appReleaseVersionParams,
      detail: { summary: "Une version publiée de l'app et ses notes" },
      response: {
        200: appReleaseEnvelope,
        401: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
