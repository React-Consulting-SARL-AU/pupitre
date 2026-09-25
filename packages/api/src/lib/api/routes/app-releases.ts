import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import { translate } from "../../i18n"
import {
  artefactUrl,
  findAppRelease,
  findAppReleaseBuild,
  latestAppRelease,
  listAppReleases,
} from "../../releases/app-releases"
import { apiError } from "../errors"
import { dataResponse, errorResponse } from "../openapi-models"
import { rateLimit } from "../plugins/rate-limit"
import { serializeData } from "../prisma"
import { PUBLIC_RELEASES_RATE_LIMIT } from "../rate-limit"
import {
  appReleaseBuildParams,
  appReleaseBuildQuery,
  appReleaseListQuery,
  appReleaseSchema,
  appReleaseVersionParams,
  latestAppReleaseQuery,
} from "./app-release-schemas"

const PUBLIC_CACHE = "public, max-age=300"

const appReleaseEnvelope = dataResponse(appReleaseSchema)

const appReleaseListEnvelope = t.Object(
  { data: t.Array(appReleaseSchema) },
  { $id: "AppReleaseList" }
)

/** Public like the bucket they point at, so any origin, a five-minute cache and their own rate budget. */
export const appReleasesRoutes = new Elysia({
  name: "app-releases-routes",
  tags: ["Releases"],
})
  // Local on purpose: a scoped hook would reach every route mounted after.
  .onBeforeHandle(({ set }) => {
    set.headers["access-control-allow-origin"] = "*"
    set.headers["cache-control"] = PUBLIC_CACHE
  })
  .use(rateLimit("public-releases", PUBLIC_RELEASES_RATE_LIMIT))
  .get(
    "/releases/app",
    async ({ query }) => ({
      data: serializeData(
        await listAppReleases(query.channel ?? "stable", query.limit)
      ),
    }),
    {
      query: appReleaseListQuery,
      detail: { summary: "Les versions publiées de l'app" },
      response: {
        200: appReleaseListEnvelope,
        422: errorResponse,
        429: errorResponse,
      },
    }
  )
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
        404: errorResponse,
        422: errorResponse,
        429: errorResponse,
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
        404: errorResponse,
        422: errorResponse,
        429: errorResponse,
      },
    }
  )
  // Links point here rather than at the bucket, so they survive a storage change.
  .get(
    "/releases/app/:version/:os/:arch",
    async ({ params, query, request, set }) => {
      const build = await findAppReleaseBuild(
        params.version,
        params.os,
        params.arch,
        query.format
      )

      if (!build) {
        const locale = resolveLocale(request.headers)

        set.status = 404

        return apiError(
          "app_release_not_found",
          translate(locale, "app_release_not_found"),
          translate(locale, "app_release_not_found_fix")
        )
      }

      const url = artefactUrl(build.r2Key)

      set.status = 303
      set.headers.location = url

      return url
    },
    {
      params: appReleaseBuildParams,
      query: appReleaseBuildQuery,
      detail: { summary: "Télécharger un artefact de l'app" },
      response: {
        303: t.String(),
        404: errorResponse,
        422: errorResponse,
        429: errorResponse,
      },
    }
  )
