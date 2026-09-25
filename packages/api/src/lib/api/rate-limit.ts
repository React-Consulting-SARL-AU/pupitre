export interface RateLimitOptions {
  limit: number
  windowMs: number
}

export interface RateLimitVerdict {
  allowed: boolean
  retryAfterSeconds: number
}

export interface RateLimitCount {
  count: number
  startedAt: number
}

/** Without a shared store (a Durable Object), a limit is only as strong as one isolate. */
export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): Promise<RateLimitCount>
}

let sharedStore: RateLimitStore | null = null

export function configureRateLimitStore(store: RateLimitStore | null): void {
  sharedStore = store
}

/** Callers without an edge-signed address all share this one bucket. */
export const UNKNOWN_CLIENT = "unknown"

export const GLOBAL_RATE_LIMIT: RateLimitOptions = {
  limit: 300,
  windowMs: 60_000,
}

/** The download page reads the list once per visit, cached five minutes: only a script comes close. */
export const PUBLIC_RELEASES_RATE_LIMIT: RateLimitOptions = {
  limit: 60,
  windowMs: 60_000,
}

/** One beacon per visit and a daily counter: past this budget it is a script. */
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
  // Per limiter, so two limiters without a shared store never see each other's keys.
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
