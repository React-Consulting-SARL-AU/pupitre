import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import { translate } from "../../../i18n"
import {
  listReleases,
  promoteRelease,
  publishRelease,
  ReleaseFingerprintConflictError,
} from "../../../releases/releases"
import { apiError } from "../../errors"
import { dataResponse, errorResponse } from "../../openapi-models"
import { requirePlatformAdmin, requirePublisher } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import {
  releasePromoteBody,
  releasePublishBody,
  releaseSchema,
  releaseVersionParams,
} from "../release-schemas"

const releaseEnvelope = dataResponse(releaseSchema)

const releaseListEnvelope = t.Object(
  { data: t.Array(releaseSchema) },
  { $id: "ReleaseList" }
)

const readRoutes = new Elysia({ name: "admin-releases-read" })
  .use(requirePlatformAdmin)
  .get(
    "/releases",
    async () => ({ data: serializeData(await listReleases()) }),
    {
      detail: { summary: "Toutes les versions publiées de l'agent" },
      response: {
        200: releaseListEnvelope,
        401: errorResponse,
        403: errorResponse,
      },
    }
  )

const publishRoutes = new Elysia({
  name: "admin-releases-publish",
})
  .use(requirePublisher)
  .post(
    "/releases",
    async ({ actor, body, request, set }) => {
      try {
        const { release, created } = await publishRelease(actor, body)

        set.status = created ? 201 : 200

        return { data: serializeData(release) }
      } catch (error) {
        if (!(error instanceof ReleaseFingerprintConflictError)) {
          throw error
        }

        const locale = resolveLocale(request.headers)

        set.status = 409

        return apiError(
          "conflict",
          translate(locale, "release_conflict", {
            version: body.version,
            arch: body.arch,
          }),
          translate(locale, "release_conflict_fix")
        )
      }
    },
    {
      body: releasePublishBody,
      detail: { summary: "Publier une version signée de l'agent" },
      response: {
        200: releaseEnvelope,
        201: releaseEnvelope,
        401: errorResponse,
        403: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
  .post(
    "/releases/:version/promote",
    async ({ actor, params, body, request, set }) => {
      const promoted = await promoteRelease(actor, params.version, body.channel)

      if (!promoted) {
        const locale = resolveLocale(request.headers)

        set.status = 404

        return apiError(
          "release_not_found",
          translate(locale, "release_not_found")
        )
      }

      return { data: serializeData(promoted) }
    },
    {
      params: releaseVersionParams,
      body: releasePromoteBody,
      detail: { summary: "Promouvoir une version dans un canal" },
      response: {
        200: releaseListEnvelope,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        422: errorResponse,
      },
    }
  )

export const adminReleasesRoutes = new Elysia({
  name: "admin-releases-routes",
})
  .use(readRoutes)
  .use(publishRoutes)
