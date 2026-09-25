import { CLIENT_IP_HEADER } from "@pupitre/auth/server"
import { resolveLocale } from "@pupitre/shared/i18n"
import { Elysia } from "elysia"
import { translate } from "../../i18n"
import { apiError } from "../errors"
import {
  createRateLimiter,
  type RateLimitOptions,
  UNKNOWN_CLIENT,
} from "../rate-limit"

// A budget per anonymous surface, so hammering one never eats the address's console budget.
export function rateLimit(name: string, options: RateLimitOptions) {
  const limiter = createRateLimiter(options)

  return new Elysia({ name: `rateLimit:${name}` }).onBeforeHandle(
    { as: "scoped" },
    async ({ request, set }) => {
      const client = request.headers.get(CLIENT_IP_HEADER) ?? UNKNOWN_CLIENT
      const verdict = await limiter.check(`${name}:${client}`)

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
