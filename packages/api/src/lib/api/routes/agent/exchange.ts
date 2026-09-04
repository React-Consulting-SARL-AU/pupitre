import { Elysia } from "elysia"
import { PublicKeyMalformedError } from "../../../devices/public-keys"
import { type Locale, resolveLocale, translate } from "../../../i18n"
import {
  EnrollmentTokenExpiredError,
  EnrollmentTokenUnknownError,
  EnrollmentTokenUsedError,
  exchangeEnrollmentToken,
} from "../../../servers/enrollment"
import { type ApiErrorPayload, apiError } from "../../errors"
import { errorResponse } from "../../openapi-models"
import { exchangeBody, serverTokenSchema } from "./schemas"

interface Refusal {
  status: 404 | 409 | 422
  payload: ApiErrorPayload
}

function refusalFor(error: unknown, locale: Locale): Refusal | null {
  if (error instanceof EnrollmentTokenUnknownError) {
    return {
      status: 404,
      payload: apiError("not_found", translate(locale, "enrollment_unknown")),
    }
  }

  if (error instanceof EnrollmentTokenUsedError) {
    return {
      status: 409,
      payload: apiError(
        "enrollment_used",
        translate(locale, "enrollment_used"),
        translate(locale, "enrollment_restart_fix")
      ),
    }
  }

  if (error instanceof EnrollmentTokenExpiredError) {
    return {
      status: 409,
      payload: apiError(
        "enrollment_expired",
        translate(locale, "enrollment_expired"),
        translate(locale, "enrollment_restart_fix")
      ),
    }
  }

  if (error instanceof PublicKeyMalformedError) {
    return {
      status: 422,
      payload: apiError(
        "validation",
        translate(locale, "key_malformed"),
        translate(locale, "key_malformed_fix")
      ),
    }
  }

  return null
}

export const agentExchangeRoutes = new Elysia({
  name: "agent-exchange-routes",
}).post(
  "/agent/exchange",
  async ({ body, request, set }) => {
    try {
      return await exchangeEnrollmentToken(
        body,
        request.headers.get("accept-language")
      )
    } catch (error) {
      const refusal = refusalFor(error, resolveLocale(request.headers))

      if (!refusal) {
        throw error
      }

      set.status = refusal.status

      return refusal.payload
    }
  },
  {
    body: exchangeBody,
    detail: {
      summary: "Échanger un jeton d'enrôlement contre un jeton de serveur",
    },
    response: {
      200: serverTokenSchema,
      404: errorResponse,
      409: errorResponse,
      422: errorResponse,
    },
  }
)
