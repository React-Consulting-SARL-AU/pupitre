import type { BetterAuthOptions } from "better-auth"

/** Without a configured storage, Better Auth only rate-limits in memory, per isolate. */
export type AuthRateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>

let configured: AuthRateLimitStorage | null = null

export function configureRateLimitStorage(
  storage: AuthRateLimitStorage | null
): void {
  configured = storage
}

export function configuredRateLimitStorage(): AuthRateLimitStorage | null {
  return configured
}
