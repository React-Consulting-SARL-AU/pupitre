export interface RateLimitOptions {
  limit: number
  windowMs: number
}

export interface RateLimitVerdict {
  allowed: boolean
  retryAfterSeconds: number
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitVerdict
}

export const GLOBAL_RATE_LIMIT: RateLimitOptions = {
  limit: 300,
  windowMs: 60_000,
}

const PRUNE_ABOVE_ENTRIES = 10_000

interface Window {
  count: number
  startedAt: number
}

export function createRateLimiter({
  limit,
  windowMs,
}: RateLimitOptions): RateLimiter {
  const windows = new Map<string, Window>()

  function prune(now: number): void {
    if (windows.size < PRUNE_ABOVE_ENTRIES) {
      return
    }

    for (const [key, window] of windows) {
      if (now - window.startedAt >= windowMs) {
        windows.delete(key)
      }
    }
  }

  return {
    check(key, now = Date.now()) {
      prune(now)

      const current = windows.get(key)
      const window =
        current && now - current.startedAt < windowMs
          ? current
          : { count: 0, startedAt: now }

      window.count += 1
      windows.set(key, window)

      if (window.count <= limit) {
        return { allowed: true, retryAfterSeconds: 0 }
      }

      const remainingMs = window.startedAt + windowMs - now

      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      }
    },
  }
}
