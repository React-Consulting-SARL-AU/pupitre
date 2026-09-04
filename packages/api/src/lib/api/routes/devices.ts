import { Elysia, t } from "elysia"
import {
  addDevice,
  DeviceAlreadyExistsError,
  listDevices,
  removeDevice,
} from "../../devices/devices"
import {
  PublicKeyMalformedError,
  PublicKeyNotEd25519Error,
} from "../../devices/public-keys"
import { type Locale, resolveLocale, translate } from "../../i18n"
import { type ApiErrorPayload, apiError } from "../errors"
import { dataResponse, errorResponse } from "../openapi-models"
import { requireAuth } from "../plugins/guards"
import { serializeData } from "../prisma"
import { deviceInputBody, deviceSchema } from "./device-schemas"

interface Refusal {
  status: 409 | 422
  payload: ApiErrorPayload
}

function refusalFor(error: unknown, locale: Locale): Refusal | null {
  if (error instanceof PublicKeyNotEd25519Error) {
    return {
      status: 422,
      payload: apiError(
        "key_not_ed25519",
        translate(locale, "key_not_ed25519"),
        translate(locale, "key_not_ed25519_fix")
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

  if (error instanceof DeviceAlreadyExistsError) {
    return {
      status: 409,
      payload: apiError(
        "device_exists",
        translate(locale, "device_exists"),
        translate(locale, "device_exists_fix")
      ),
    }
  }

  return null
}

export const devicesRoutes = new Elysia({
  name: "devices-routes",
  tags: ["Devices"],
})
  .use(requireAuth)
  .get(
    "/me/devices",
    async ({ user }) => ({ data: serializeData(await listDevices(user.id)) }),
    {
      detail: { summary: "Les appareils de l'utilisateur" },
      response: {
        200: t.Object({ data: t.Array(deviceSchema) }, { $id: "DeviceList" }),
        401: errorResponse,
      },
    }
  )
  .post(
    "/me/devices",
    async ({ user, body, request, set }) => {
      try {
        const device = await addDevice(
          user.id,
          body,
          request.headers.get("accept-language")
        )

        set.status = 201

        return { data: serializeData(device) }
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
      body: deviceInputBody,
      detail: { summary: "Ajouter un appareil" },
      response: {
        201: dataResponse(deviceSchema),
        401: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )
  .delete(
    "/me/devices/:id",
    async ({ user, params, request, set }) => {
      if (await removeDevice(user.id, params.id)) {
        set.status = 204

        return
      }

      set.status = 404

      return apiError(
        "not_found",
        translate(resolveLocale(request.headers), "device_not_found")
      )
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Révoquer un appareil" },
      response: {
        204: t.Void(),
        401: errorResponse,
        404: errorResponse,
      },
    }
  )
