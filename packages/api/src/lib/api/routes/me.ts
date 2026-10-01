import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia, t } from "elysia"
import { appUrlFromEnv } from "../../billing/config"
import { translate } from "../../i18n"
import {
  ACCOUNT_SETTINGS_PATH,
  AccountHoldsDataError,
  DataConsentVersionError,
  declineDataConsent,
  recordDataConsent,
} from "../../me/data-consent"
import { loadMe, setActiveOrganization, setUserLocale } from "../../me/me"
import { listServersForUser } from "../../servers/servers"
import { apiError } from "../errors"
import { dataResponse, errorResponse } from "../openapi-models"
import { memberRole } from "../plugins/auth"
import { requireAuth, requireSession } from "../plugins/guards"
import { serializeData } from "../prisma"
import {
  dataConsentBody,
  dataConsentSchema,
  meInputBody,
  meSchema,
  serverForUserSchema,
} from "./me-schemas"

// Reading the account and agreeing to the data consent must work before that consent exists.
export const meRoutes = new Elysia({ name: "me-routes", tags: ["Me"] })
  .use(requireSession)
  .get(
    "/me",
    async ({ user, organizationId, role, platformRole }) =>
      serializeData(await loadMe({ user, organizationId, role, platformRole })),
    {
      detail: {
        summary: "L'utilisateur connecté, ses organisations et son rôle",
      },
      response: { 200: meSchema, 401: errorResponse },
    }
  )
  .patch(
    "/me",
    async ({
      user,
      session,
      organizationId,
      role,
      platformRole,
      body,
      request,
      set,
    }) => {
      if (body.locale) {
        await setUserLocale(user.id, body.locale)
      }

      let active = organizationId
      let held = role

      if (body.organization_id) {
        const moved = await setActiveOrganization(
          user.id,
          session.id,
          body.organization_id
        )

        if (!moved) {
          set.status = 403

          return apiError(
            "forbidden",
            translate(resolveLocale(request.headers), "organization_forbidden"),
            translate(
              resolveLocale(request.headers),
              "organization_forbidden_fix"
            )
          )
        }

        active = body.organization_id
        held = await memberRole(user.id, body.organization_id)
      }

      return serializeData(
        await loadMe({
          user,
          organizationId: active,
          role: held,
          platformRole,
        })
      )
    },
    {
      body: meInputBody,
      detail: {
        summary: "Changer la langue ou l'organisation active de l'appelant",
      },
      response: {
        200: meSchema,
        401: errorResponse,
        403: errorResponse,
        422: errorResponse,
      },
    }
  )
  .post(
    "/me/consent",
    async ({ user, body, request, set }) => {
      try {
        return {
          data: serializeData(await recordDataConsent(user.id, body.version)),
        }
      } catch (error) {
        if (error instanceof DataConsentVersionError) {
          const locale = resolveLocale(request.headers)

          set.status = 409
          return apiError(
            "conflict",
            translate(locale, "consent_version_outdated"),
            translate(locale, "consent_version_outdated_fix")
          )
        }

        throw error
      }
    },
    {
      body: dataConsentBody,
      detail: {
        summary:
          "Consentir au stockage des données du compte, dans la version du texte affiché",
      },
      response: {
        200: dataResponse(dataConsentSchema),
        401: errorResponse,
        403: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    }
  )

  .post(
    "/me/consent/decline",
    async ({ user, request, set }) => {
      try {
        await declineDataConsent(user.id)

        set.status = 204
      } catch (error) {
        if (error instanceof AccountHoldsDataError) {
          const locale = resolveLocale(request.headers)

          set.status = 409
          return apiError(
            "conflict",
            translate(locale, "consent_decline_held"),
            translate(locale, "consent_decline_held_fix", {
              url: `${appUrlFromEnv()}${ACCOUNT_SETTINGS_PATH}`,
            })
          )
        }

        throw error
      }
    },
    {
      detail: {
        summary:
          "Refuser le consentement : efface sur-le-champ un compte qui ne tient que son inscription",
      },
      response: {
        204: t.Void(),
        401: errorResponse,
        403: errorResponse,
        409: errorResponse,
      },
    }
  )

export const meServersRoutes = new Elysia({
  name: "me-servers-routes",
  tags: ["Me"],
})
  .use(requireAuth)
  .get(
    "/me/servers",
    async ({ user }) => ({
      data: serializeData(await listServersForUser(user.id)),
    }),
    {
      detail: { summary: "Les serveurs assignés à l'utilisateur" },
      response: {
        200: t.Object(
          { data: t.Array(serverForUserSchema) },
          { $id: "ServerForUserList" }
        ),
        401: errorResponse,
      },
    }
  )
