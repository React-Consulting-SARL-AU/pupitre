import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia } from "elysia"
import { translate } from "../../../i18n"
import {
  AppReleaseFingerprintConflictError,
  promoteAppRelease,
  publishAppRelease,
} from "../../../releases/app-releases"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requirePlatformAdmin } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  appReleaseBuildSchema,
  appReleasePromoteBody,
  appReleasePublishBody,
  appReleaseSchema,
  appReleaseVersionParams,
} from "../app-release-schemas"

const appReleaseBuildEnvelope = dataResponse(appReleaseBuildSchema)

const appReleaseEnvelope = dataResponse(appReleaseSchema)

export const adminAppReleasesRoutes = new Elysia({
  name: "admin-app-releases-routes",
})
  .use(requirePlatformAdmin)
  .post(
    "/app-releases",
    async ({ user, body, request, set }) => {
      try {
        const { build, created } = await publishAppRelease(user.id, body)

        set.status = created ? 201 : 200

        return { data: serializeData(build) }
      } catch (error) {
        if (!(error instanceof AppReleaseFingerprintConflictError)) {
          throw error
        }

        const locale = resolveLocale(request.headers)

        set.status = 409

        return apiError(
          "conflict",
          translate(locale, "app_release_conflict", {
            version: body.version,
            os: body.os,
          }),
          translate(locale, "app_release_conflict_fix")
        )
      }
    },
    {
      body: appReleasePublishBody,
      detail: { summary: "Publier une version de l'app pour un système" },
      response: {
        200: appReleaseBuildEnvelope,
        201: appReleaseBuildEnvelope,
        401: errorResponse,
        403: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
  .post(
    "/app-releases/:version/promote",
    async ({ user, params, body, request, set }) => {
      const promoted = await promoteAppRelease(
        user.id,
        params.version,
        body.channel
      )

      if (!promoted) {
        const locale = resolveLocale(request.headers)

        set.status = 404

        return apiError(
          "app_release_not_found",
          translate(locale, "app_release_not_found")
        )
      }

      return { data: serializeData(promoted) }
    },
    {
      params: appReleaseVersionParams,
      body: appReleasePromoteBody,
      detail: { summary: "Promouvoir une version de l'app dans un canal" },
      response: {
        200: appReleaseEnvelope,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )
