import { Elysia, t } from "elysia"
import { resolveLocale, translate } from "../../i18n"
import {
  DEFAULT_ARCH,
  findRelease,
  latestRelease,
} from "../../releases/releases"
import { apiError } from "../errors"
import { errorResponse } from "../openapi-models"
import { requireAuth } from "../plugins/guards"
import { releaseRedirect } from "./release-redirect"
import {
  latestReleaseQuery,
  latestReleaseSchema,
  releaseArchQuery,
  releaseVersionParams,
} from "./release-schemas"

export const releasesRoutes = new Elysia({
  name: "releases-routes",
  tags: ["Releases"],
})
  .use(requireAuth)
  .get(
    "/releases/agent/latest",
    async ({ query, request, set }) => {
      const release = await latestRelease(
        query.channel ?? "stable",
        query.arch ?? DEFAULT_ARCH
      )

      if (!release) {
        const locale = resolveLocale(request.headers)

        set.status = 404

        return apiError(
          "release_not_found",
          translate(locale, "release_not_found"),
          translate(locale, "release_not_found_fix")
        )
      }

      return {
        version: release.version,
        arch: release.arch,
        sha256: release.sha256,
        signature: release.signature,
      }
    },
    {
      query: latestReleaseQuery,
      detail: { summary: "La dernière version de l'agent d'un canal" },
      response: {
        200: latestReleaseSchema,
        401: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
  .get(
    "/releases/agent/:version",
    async ({ params, query, request, set }) => {
      const locale = resolveLocale(request.headers)
      const release = await findRelease(
        params.version,
        query.arch ?? DEFAULT_ARCH
      )

      if (!release) {
        set.status = 404

        return apiError(
          "release_not_found",
          translate(locale, "release_not_found"),
          translate(locale, "release_not_found_fix")
        )
      }

      const redirect = await releaseRedirect(release, locale)

      set.status = 303
      Object.assign(set.headers, redirect.headers)

      return redirect.body
    },
    {
      params: releaseVersionParams,
      query: releaseArchQuery,
      detail: { summary: "Télécharger le binaire de l'agent depuis l'app" },
      response: {
        303: t.String(),
        401: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
