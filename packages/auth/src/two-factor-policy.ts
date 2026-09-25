import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth"
import { createAuthMiddleware } from "better-auth/api"
import { deleteSessionCookie } from "better-auth/cookies"
import { generateRandomString } from "better-auth/crypto"

export const TWO_FACTOR_CHALLENGE_PATH = "/auth/two-factor"
export const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 600

const TWO_FACTOR_COOKIE_NAME = "two_factor"
const IDENTIFIER_LENGTH = 20

// The built-in plugin only guards password sign-ins, which Pupitre has none of; a passkey is already a second factor.
const CHALLENGED_PATHS = new Set(["/magic-link/verify", "/callback/:id"])

const DEFAULT_REDIRECT = "/dashboard/servers"

function twoFactorEnabled(user: unknown): boolean {
  return (
    (user as { twoFactorEnabled?: unknown } | null)?.twoFactorEnabled === true
  )
}

function challengeUrl(consoleBaseUrl: string, redirectTo: string): string {
  const url = new URL(TWO_FACTOR_CHALLENGE_PATH, consoleBaseUrl)

  url.searchParams.set("callbackURL", redirectTo)

  return url.toString()
}

function pendingRedirect(ctx: GenericEndpointContext): string {
  return ctx.context.responseHeaders?.get("location") ?? DEFAULT_REDIRECT
}

export function twoFactorChallenge(consoleBaseUrl: string): BetterAuthPlugin {
  return {
    id: "two-factor-challenge",
    hooks: {
      after: [
        {
          matcher: (context) => CHALLENGED_PATHS.has(context.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const pending = ctx.context.newSession

            if (!(pending && twoFactorEnabled(pending.user))) {
              return
            }

            const redirectTo = pendingRedirect(ctx)

            deleteSessionCookie(ctx, true)
            await ctx.context.internalAdapter.deleteSession(
              pending.session.token
            )
            ctx.context.setNewSession(null)

            const identifier = `2fa-${generateRandomString(IDENTIFIER_LENGTH)}`
            const expiresAt = new Date(
              Date.now() + TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000
            )

            await ctx.context.internalAdapter.createVerificationValue({
              value: pending.user.id,
              identifier,
              expiresAt,
            })
            await ctx.context.internalAdapter.createVerificationValue({
              value: "0",
              identifier: `2fa-attempts-${identifier}`,
              expiresAt,
            })

            const cookie = ctx.context.createAuthCookie(
              TWO_FACTOR_COOKIE_NAME,
              { maxAge: TWO_FACTOR_CHALLENGE_TTL_SECONDS }
            )

            await ctx.setSignedCookie(
              cookie.name,
              identifier,
              ctx.context.secret,
              cookie.attributes
            )

            throw ctx.redirect(challengeUrl(consoleBaseUrl, redirectTo))
          }),
        },
      ],
    },
  }
}
