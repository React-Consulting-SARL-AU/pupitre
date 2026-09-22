export interface RateLimitOptions {
  limit: number
  windowMs: number
}

export interface RateLimitVerdict {
  allowed: boolean
  retryAfterSeconds: number
}

/** A window a store holds, already counted: the budget is the caller's alone. */
export interface RateLimitCount {
  count: number
  startedAt: number
}

/**
 * Where the windows live. The Worker configures one shared across isolates —
 * a Durable Object — so a budget holds everywhere at once; without one, each
 * limiter keeps its own, and the limit is only as strong as one isolate.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): Promise<RateLimitCount>
}

let sharedStore: RateLimitStore | null = null

/** What the Worker calls with its binding-backed store; a test can hand one back. */
export function configureRateLimitStore(store: RateLimitStore | null): void {
  sharedStore = store
}

/** What an address-less caller draws from: the edge signs real ones, the rest share one bucket. */
export const UNKNOWN_CLIENT = "unknown"

export const GLOBAL_RATE_LIMIT: RateLimitOptions = {
  limit: 300,
  windowMs: 60_000,
}

/**
 * What one address may take from the routes that answer without a session.
 *
 * The download page of the site reads the list once per visit, and the answer
 * is cacheable for five minutes: a human never comes close, a script does.
 */
export const PUBLIC_RELEASES_RATE_LIMIT: RateLimitOptions = {
  limit: 60,
  windowMs: 60_000,
}

/**
 * What one address may count toward the affiliate links.
 *
 * A visit sends one beacon and the counter is by day: past this budget it is a
 * script, and the answer stays the same whether the hit counted or not.
 */
export const AFFILIATE_HIT_RATE_LIMIT: RateLimitOptions = {
  limit: 60,
  windowMs: 60_000,
}

const PRUNE_ABOVE_ENTRIES = 10_000

interface Window {
  count: number
  startedAt: number
  windowMs: number
}

/** The fallback store: one isolate's memory, which is every limiter's floor. */
export function createMemoryRateLimitStore(): RateLimitStore {
  const windows = new Map<string, Window>()

  function prune(now: number): void {
    if (windows.size < PRUNE_ABOVE_ENTRIES) {
      return
    }

    for (const [key, window] of windows) {
      if (now - window.startedAt >= window.windowMs) {
        windows.delete(key)
      }
    }
  }

  return {
    // The store's contract is async for the shared implementations; this one
    // holds nothing to await, so it settles on the spot.
    hit(key, windowMs, now) {
      prune(now)

      const current = windows.get(key)
      const window =
        current && now - current.startedAt < windowMs
          ? current
          : { count: 0, startedAt: now, windowMs }

      window.count += 1
      window.windowMs = windowMs
      windows.set(key, window)

      return Promise.resolve({
        count: window.count,
        startedAt: window.startedAt,
      })
    },
  }
}

export interface RateLimiter {
  check(key: string, now?: number): Promise<RateLimitVerdict>
}

export function createRateLimiter({
  limit,
  windowMs,
}: RateLimitOptions): RateLimiter {
  // The fallback belongs to this limiter alone: without a shared store, two
  // limiters never see each other's keys.
  const memory = createMemoryRateLimitStore()

  return {
    async check(key, now = Date.now()) {
      const { count, startedAt } = await (sharedStore ?? memory).hit(
        key,
        windowMs,
        now
      )

      if (count <= limit) {
        return { allowed: true, retryAfterSeconds: 0 }
      }

      const remainingMs = startedAt + windowMs - now

      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      }
    },
  }
}
