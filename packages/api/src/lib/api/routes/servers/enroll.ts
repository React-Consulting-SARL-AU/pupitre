import { type Locale, resolveLocale } from "@pupitre/shared/i18n"
import { Elysia } from "elysia"
import { translate } from "../../../i18n"
import {
  EnrollmentDeviceUnknownError,
  EntitlementMissingError,
  enrollServer,
  SeatQuotaReachedError,
} from "../../../servers/enrollment"
import { type ApiErrorPayload, apiError } from "../../errors"
import { errorResponse } from "../../openapi-models"
import { requireEntitlement, requireOrg } from "../../plugins/guards"
import { serializeData } from "../../prisma"
import { enrollBody, enrollmentSchema } from "./schemas"

interface Refusal {
  status: 403 | 404
  payload: ApiErrorPayload
}

function refusalFor(
  error: unknown,
  locale: Locale,
  organizationId: string
): Refusal | null {
  if (error instanceof EnrollmentDeviceUnknownError) {
    return {
      status: 404,
      payload: apiError("not_found", translate(locale, "device_not_found")),
    }
  }

  if (error instanceof EntitlementMissingError) {
    return {
      status: 403,
      payload: apiError(
        error.refusal,
        translate(locale, error.refusal),
        translate(locale, `${error.refusal}_fix`)
      ),
    }
  }

  if (error instanceof SeatQuotaReachedError) {
    return {
      status: 403,
      payload: apiError(
        "seat_quota_reached",
        translate(locale, "seat_quota_reached", { quota: error.quota }),
        translate(locale, "seat_quota_reached_fix", {
          organization: organizationId,
        })
      ),
    }
  }

  return null
}

export const enrollRoutes = new Elysia({ name: "servers-enroll-routes" })
  .use(requireOrg)
  .use(requireEntitlement)
  .post(
    "/servers/enroll",
    async ({ user, organizationId, body, request, set }) => {
      try {
        const enrolled = await enrollServer(
          { userId: user.id, organizationId },
          body
        )

        set.status = 201

        return serializeData(enrolled)
      } catch (error) {
        const refusal = refusalFor(
          error,
          resolveLocale(request.headers),
          organizationId
        )

        if (!refusal) {
          throw error
        }

        set.status = refusal.status

        return refusal.payload
      }
    },
    {
      body: enrollBody,
      detail: { summary: "Rattacher un serveur" },
      response: {
        201: enrollmentSchema,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    }
  )
