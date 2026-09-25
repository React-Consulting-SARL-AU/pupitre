import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"

const ADMIN_ENDPOINTS_CLOSED_CODE = "ADMIN_ENDPOINTS_CLOSED"

const ADMIN_PATH_PREFIX = "/admin/"

/** The team acts through the platform's audited `/api/v1/admin` routes; Better Auth's own admin endpoints stay shut. */
export function adminLockdown(): BetterAuthPlugin {
  return {
    id: "admin-lockdown",
    hooks: {
      before: [
        {
          matcher: (context) =>
            (context.path ?? "").startsWith(ADMIN_PATH_PREFIX),
          handler: createAuthMiddleware(() => {
            throw new APIError("FORBIDDEN", {
              code: ADMIN_ENDPOINTS_CLOSED_CODE,
              message:
                "These endpoints are closed. Use the platform console instead.",
            })
          }),
        },
      ],
    },
  }
}
