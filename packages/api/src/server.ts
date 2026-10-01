import { openapi } from "@elysiajs/openapi"
import { configureAuthEmails } from "@pupitre/auth/emails"
import {
  configureAccountHooks,
  configureOrganizationHooks,
} from "@pupitre/auth/hooks"
import { type Auth, CLIENT_IP_HEADER } from "@pupitre/auth/server"
import { resolveLocale } from "@pupitre/shared/i18n"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { type AnyElysia, Elysia, ValidationError } from "elysia"
import { authEmails } from "./emails/renderer"
import { createEmailSender } from "./emails/send"
import { recordSignUpReferral } from "./lib/affiliates/affiliates"
import { apiError, createErrorRef } from "./lib/api/errors"
import { isForeignCookieWrite } from "./lib/api/origin"
import { configureAuth } from "./lib/api/plugins/auth"
import { type ApiPrisma, configurePrisma } from "./lib/api/prisma"
import {
  createRateLimiter,
  GLOBAL_RATE_LIMIT,
  type RateLimitVerdict,
  UNKNOWN_CLIENT,
} from "./lib/api/rate-limit"
import { routes } from "./lib/api/routes"
import { describeValidationError } from "./lib/api/validation-errors"
import { translate } from "./lib/i18n"
import { publishInboxEvent } from "./lib/mail/realtime"
import { deleteAccountFromConsole } from "./lib/me/delete-account"
import { unassignServersOfMember } from "./lib/servers/assign"

export type { ApiPrisma } from "./lib/api/prisma"

// Filled at import time: the Better Auth route never imports this module's exports.
configureAuthEmails({ renderer: authEmails, sendEmail: createEmailSender() })
configureOrganizationHooks({
  onMemberRemoved: async ({ organizationId, userId }) => {
    await unassignServersOfMember(organizationId, userId)

    if (organizationId === PLATFORM_ORGANIZATION_ID) {
      await publishInboxEvent({ type: "access.revoked", user_id: userId })
    }
  },
  onSignedUp: recordSignUpReferral,
})
configureAccountHooks({ onAccountDeleting: deleteAccountFromConsole })

export interface ApiRuntime {
  prisma: ApiPrisma
  auth: Auth
}

export function configureApi({ prisma, auth }: ApiRuntime): void {
  configurePrisma(prisma)
  configureAuth(auth)
}

const LOGGED_MESSAGE_LENGTH = 200

// Never the error itself: its meta and arguments can carry row data.
function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error
  }

  const code = (error as { code?: unknown }).code

  return [
    error.name,
    typeof code === "string" ? `code=${code}` : null,
    error.message.split("\n")[0]?.slice(0, LOGGED_MESSAGE_LENGTH) ?? "",
  ]
    .filter((part) => part)
    .join(" ")
}

function reportInternalError(error: unknown, request: Request): string {
  const ref = createErrorRef()

  console.error(
    `[api] internal error ref=${ref} ${request.method} ${request.url} ${describeError(error)}`
  )

  return ref
}

export function createApi<Routes extends AnyElysia>(apiRoutes: Routes) {
  // Workers forbid `new Function`, which Elysia's AOT compiler and exact-mirror normalizer use.
  return new Elysia({ aot: false, normalize: "typebox", prefix: "/api/v1" })
    .onError(({ code, error, request, set }) => {
      const locale = resolveLocale(request.headers)

      if (code === "VALIDATION" && error instanceof ValidationError) {
        const { message, fix } = describeValidationError(error, locale)

        set.status = 422

        return apiError("validation", message, fix)
      }

      // Without AOT, Elysia surfaces a JSON parse error as a plain SyntaxError, not PARSE.
      if (code === "PARSE" || (error instanceof SyntaxError && request.body)) {
        set.status = 400

        return apiError(
          "validation",
          translate(locale, "unreadable_body"),
          translate(locale, "unreadable_body_fix")
        )
      }

      if (code === "NOT_FOUND") {
        set.status = 404

        return apiError("not_found", translate(locale, "not_found"))
      }

      const ref = reportInternalError(error, request)

      set.status = 500

      return apiError("internal", translate(locale, "internal", { ref }))
    })
    .use(
      openapi({
        path: "/openapi",
        documentation: {
          info: {
            title: "Pupitre API",
            version: "1.0.0",
            description:
              "API de la plateforme Pupitre : console, app desktop et agent.",
          },
        },
      })
    )
    .use(apiRoutes)
}

export const app = createApi(routes)

export type Api = typeof app

const globalRateLimiter = createRateLimiter(GLOBAL_RATE_LIMIT)

function tooManyRequests(
  request: Request,
  verdict: RateLimitVerdict
): Response {
  const locale = resolveLocale(request.headers)

  return Response.json(
    apiError(
      "rate_limited",
      translate(locale, "rate_limited"),
      translate(locale, "rate_limited_fix", {
        seconds: verdict.retryAfterSeconds,
      })
    ),
    {
      status: 429,
      headers: { "retry-after": String(verdict.retryAfterSeconds) },
    }
  )
}

export async function handleApiRequest(request: Request): Promise<Response> {
  // Requests missing the edge's IP header share one tight budget instead of going unlimited.
  const clientIp = request.headers.get(CLIENT_IP_HEADER) ?? UNKNOWN_CLIENT
  const verdict = await globalRateLimiter.check(`global:${clientIp}`)

  if (!verdict.allowed) {
    return tooManyRequests(request, verdict)
  }

  if (isForeignCookieWrite(request)) {
    const locale = resolveLocale(request.headers)

    return Response.json(
      apiError("forbidden", translate(locale, "forbidden")),
      {
        status: 403,
      }
    )
  }

  return await app.handle(request)
}
