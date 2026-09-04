import { Elysia } from "elysia"
import { resolveLocale, translate } from "../../../i18n"
import {
  AppReleaseFingerprintConflictError,
  publishAppRelease,
} from "../../../releases/app-releases"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requirePlatformAdmin } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  appReleaseBuildSchema,
  appReleasePublishBody,
} from "../app-release-schemas"

const appReleaseBuildEnvelope = dataResponse(appReleaseBuildSchema)

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
