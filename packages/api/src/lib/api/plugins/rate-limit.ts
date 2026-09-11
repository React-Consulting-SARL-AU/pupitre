import { CLIENT_IP_HEADER } from "@pupitre/auth/server"
import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia } from "elysia"
import { translate } from "../../i18n"
import { apiError } from "../errors"
import { createRateLimiter, type RateLimitOptions } from "../rate-limit"

/**
 * A budget of its own, for a group of routes that answers without a session.
 *
 * The global limiter already caps a client; this one caps what an anonymous
 * caller may take from one surface, so that hammering the download list never
 * eats the budget the same address needs for the console.
 */

const UNKNOWN_CLIENT = "unknown"

export function rateLimit(name: string, options: RateLimitOptions) {
  const limiter = createRateLimiter(options)

  return new Elysia({ name: `rateLimit:${name}` }).onBeforeHandle(
    { as: "scoped" },
    ({ request, set }) => {
      const client = request.headers.get(CLIENT_IP_HEADER) ?? UNKNOWN_CLIENT
      const verdict = limiter.check(client)

      if (verdict.allowed) {
        return
      }

      const locale = resolveLocale(request.headers)

      set.status = 429
      set.headers["retry-after"] = String(verdict.retryAfterSeconds)

      return apiError(
        "rate_limited",
        translate(locale, "rate_limited"),
        translate(locale, "rate_limited_fix", {
          seconds: verdict.retryAfterSeconds,
        })
      )
    }
  )
}
