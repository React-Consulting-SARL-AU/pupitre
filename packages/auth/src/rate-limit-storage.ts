import type { BetterAuthOptions } from "better-auth"

/**
 * What Better Auth counts its attempts against: one atomic `consume` decides
 * and increments in a single step, so concurrent requests cannot all pass a
 * stale read. The Worker configures one backed by a Durable Object, so the
 * sign-in budget holds across isolates; without one the library keeps its own
 * in memory, best-effort per isolate.
 */
export type AuthRateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>

let configured: AuthRateLimitStorage | null = null

/** What the Worker calls with its binding-backed storage; a test can hand one back. */
export function configureRateLimitStorage(
  storage: AuthRateLimitStorage | null
): void {
  configured = storage
}

export function configuredRateLimitStorage(): AuthRateLimitStorage | null {
  return configured
}
