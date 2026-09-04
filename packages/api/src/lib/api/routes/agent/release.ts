import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import { translate } from "../../../i18n"
import { findRelease } from "../../../releases/releases"
import { apiError } from "../../errors"
import { errorResponse } from "../../openapi-models"
import { requireServer } from "../../plugins/guards"
import { releaseRedirect } from "../release-redirect"
import { agentReleaseSchema, releaseVersionParams } from "../release-schemas"

export const agentReleaseRoutes = new Elysia({ name: "agent-release-routes" })
  .use(requireServer)
  .get(
    "/agent/release/:version",
    async ({ currentServer, params, request, set }) => {
      const locale = resolveLocale(request.headers)
      const release = await findRelease(params.version, currentServer.arch)

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
      detail: { summary: "Le binaire signé de la version demandée" },
      response: {
        303: t.String(),
        401: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
  .get(
    "/agent/release/:version/metadata",
    async ({ currentServer, params, request, set }) => {
      const release = await findRelease(params.version, currentServer.arch)

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
        channel: release.channel,
      }
    },
    {
      params: releaseVersionParams,
      detail: {
        summary: "L'empreinte et la signature de la version demandée",
      },
      response: {
        200: agentReleaseSchema,
        401: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
