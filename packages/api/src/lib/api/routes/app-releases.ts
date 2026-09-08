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
import { serializeData } from "../prisma"
import {
  appReleaseBuildParams,
  appReleaseListQuery,
  appReleaseSchema,
  appReleaseVersionParams,
  latestAppReleaseQuery,
} from "./app-release-schemas"

/**
 * The app's versions, readable without a session.
 *
 * The artefacts are public: they live in the download bucket, the site's
 * page lists them and the app updates from there without asking the
 * platform for anything. What stays private is the agent binary — a
 * different family of routes, with a token.
 */

const appReleaseEnvelope = dataResponse(appReleaseSchema)

const appReleaseListEnvelope = t.Object(
  { data: t.Array(appReleaseSchema) },
  { $id: "AppReleaseList" }
)

export const appReleasesRoutes = new Elysia({
  name: "app-releases-routes",
  tags: ["Releases"],
})
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
      response: { 200: appReleaseListEnvelope, 422: errorResponse },
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
      },
    }
  )
  /**
   * The stable link to an artefact.
   *
   * The site and the help pages point here rather than at the bucket URL:
   * the platform knows where the file was dropped, and the day the storage
   * changes, links already written elsewhere keep working.
   */
  .get(
    "/releases/app/:version/:os/:arch",
    async ({ params, request, set }) => {
      const build = await findAppReleaseBuild(
        params.version,
        params.os,
        params.arch
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
      set.headers["cache-control"] = "public, max-age=300"

      return url
    },
    {
      params: appReleaseBuildParams,
      detail: { summary: "Télécharger un artefact de l'app" },
      response: {
        303: t.String(),
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
