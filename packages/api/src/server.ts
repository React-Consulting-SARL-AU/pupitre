import { openapi } from "@elysiajs/openapi"
import { configureAuthEmails } from "@pupitre/auth/emails"
import { type Auth, CLIENT_IP_HEADER } from "@pupitre/auth/server"
import { resolveLocale } from "@pupitre/shared/i18n"
import { type AnyElysia, Elysia, ValidationError } from "elysia"
import { authEmails } from "./emails/renderer"
import { createEmailSender } from "./emails/send"
import { apiError, createErrorRef } from "./lib/api/errors"
import { configureAuth } from "./lib/api/plugins/auth"
import { type ApiPrisma, configurePrisma } from "./lib/api/prisma"
import {
  createRateLimiter,
  GLOBAL_RATE_LIMIT,
  type RateLimitVerdict,
} from "./lib/api/rate-limit"
import { routes } from "./lib/api/routes"
import { describeValidationError } from "./lib/api/validation-errors"
import { translate } from "./lib/i18n"

export type { ApiPrisma } from "./lib/api/prisma"

// The Better Auth handler is served from its own route, which never imports
// this module's exports: the port has to be filled at import time.
configureAuthEmails({ renderer: authEmails, sendEmail: createEmailSender() })

export interface ApiRuntime {
  prisma: ApiPrisma
  auth: Auth
}

export function configureApi({ prisma, auth }: ApiRuntime): void {
  configurePrisma(prisma)
  configureAuth(auth)
}

function reportInternalError(error: unknown, request: Request): string {
  const ref = createErrorRef()

  console.error(
    `[api] internal error ref=${ref} ${request.method} ${request.url}`,
    error
  )

  return ref
}

export function createApi<Routes extends AnyElysia>(apiRoutes: Routes) {
  // Workers forbid `new Function`, which Elysia's ahead-of-time compiler uses.
  return new Elysia({ aot: false, prefix: "/api/v1" })
    .onError(({ code, error, request, set }) => {
      const locale = resolveLocale(request.headers)

      if (code === "VALIDATION" && error instanceof ValidationError) {
        const { message, fix } = describeValidationError(error, locale)

        set.status = 422

        return apiError("validation", message, fix)
      }

      // Without ahead-of-time compilation Elysia lets the JSON parse error
      // through as a plain SyntaxError instead of its own PARSE code.
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
  const clientIp = request.headers.get(CLIENT_IP_HEADER)

  if (clientIp) {
    const verdict = globalRateLimiter.check(clientIp)

    if (!verdict.allowed) {
      return tooManyRequests(request, verdict)
    }
  }

  return await app.handle(request)
}
