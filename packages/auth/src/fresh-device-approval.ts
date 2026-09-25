import { FRESH_SIGN_IN_SECONDS } from "@pupitre/shared/keys"
import type { BetterAuthPlugin } from "better-auth"
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api"

export const SESSION_NOT_FRESH_CODE = "SESSION_NOT_FRESH"

export const DEVICE_APPROVE_PATH = "/device/approve"

const SECOND_MS = 1000

const BEARER_RE = /^Bearer\s+(\S+)$/i

/** A session opens only through the whole sign-in, second factor included, so its age is the age of that proof. */
export function isFreshSignIn(createdAt: Date | string, now: Date): boolean {
  const signedInAt = new Date(createdAt).getTime()

  return now.getTime() - signedInAt <= FRESH_SIGN_IN_SECONDS * SECOND_MS
}

type HookContext = Parameters<typeof getSessionFromCtx>[0]

/**
 * `bearer` turns the header into a cookie only once every before hook has run,
 * so a bearer session is read here from its token; it can only make the check stricter.
 */
async function signedInAt(ctx: HookContext): Promise<Date | string | null> {
  const fromCookie = await getSessionFromCtx(ctx)

  if (fromCookie) {
    return fromCookie.session.createdAt
  }

  const token = ctx.headers
    ?.get("authorization")
    ?.match(BEARER_RE)?.[1]
    ?.split(".")[0]

  if (!token) {
    return null
  }

  const found = await ctx.context.internalAdapter.findSession(decoded(token))

  return found?.session.createdAt ?? null
}

function decoded(token: string): string {
  try {
    return decodeURIComponent(token)
  } catch {
    return token
  }
}

/** Confirming a device code hands out a session: the browser that confirms must have signed in moments ago. */
export function freshDeviceApproval(): BetterAuthPlugin {
  return {
    id: "fresh-device-approval",
    hooks: {
      before: [
        {
          matcher: (context) => context.path === DEVICE_APPROVE_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const createdAt = await signedInAt(ctx)

            if (createdAt === null || isFreshSignIn(createdAt, new Date())) {
              return
            }

            throw new APIError("FORBIDDEN", {
              code: SESSION_NOT_FRESH_CODE,
              message: "Sign in again to confirm this device.",
            })
          }),
        },
      ],
    },
  }
}
