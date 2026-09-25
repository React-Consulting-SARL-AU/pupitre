import {
  configureRateLimitStore,
  createMemoryRateLimitStore,
  type RateLimitCount,
  type RateLimitStore,
} from "@pupitre/api/rate-limit"
import {
  type AuthRateLimitStorage,
  configureRateLimitStorage,
} from "@pupitre/auth/rate-limit-storage"

// Sharded so a flood on one key never queues the whole platform behind it.
const SHARDS = 8

const SWEEP_AFTER_MS = 60_000

const ORIGIN = "https://rate-limit.internal"

interface Stored {
  count: number
  // Window start (fixed) or last request (rolling).
  at: number
  expiresAt: number
}

export interface FixedHit {
  key: string
  windowMs: number
  now: number
}

export interface RollingRule {
  key: string
  // Better Auth counts in seconds.
  window: number
  max: number
  now: number
}

function read(stored: Stored | undefined, now: number): Stored | null {
  if (!stored || now >= stored.expiresAt) {
    return null
  }

  return stored
}

export function nextFixed(
  stored: Stored | undefined,
  windowMs: number,
  now: number
): { count: number; startedAt: number; expiresAt: number } {
  const current = read(stored, now)
  const startedAt = current && now - current.at < windowMs ? current.at : now

  return {
    count: (current && now - current.at < windowMs ? current.count : 0) + 1,
    startedAt,
    expiresAt: startedAt + windowMs,
  }
}

// Better Auth's rolling rule, decided and incremented in one atomic step.
export function nextRolling(
  stored: Stored | undefined,
  windowSeconds: number,
  max: number,
  now: number
): {
  count: number
  lastRequest: number
  allowed: boolean
  retryAfter: number | null
} {
  const windowMs = windowSeconds * 1000
  const current = read(stored, now)
  const count = current && now - current.at <= windowMs ? current.count : 0
  const lastRequest = current ? current.at : now
  const allowed = count < max

  return {
    count: allowed ? count + 1 : count,
    lastRequest: allowed ? now : lastRequest,
    allowed,
    retryAfter: allowed
      ? null
      : Math.max(1, Math.ceil((lastRequest + windowMs - now) / 1000)),
  }
}

function refuse(status: number, message: string): Response {
  return Response.json({ error: { message } }, { status })
}

// Never pushes back a sweep already scheduled sooner.
async function scheduleSweep(state: DurableObjectState): Promise<void> {
  const alarm = await state.storage.getAlarm()

  if (alarm === null || alarm > Date.now() + SWEEP_AFTER_MS) {
    await state.storage.setAlarm(Date.now() + SWEEP_AFTER_MS)
  }
}

export async function sweepExpired(state: DurableObjectState): Promise<void> {
  const now = Date.now()

  for (const [key, stored] of await state.storage.list<Stored>()) {
    if (now >= stored.expiresAt) {
      await state.storage.delete(key)
    }
  }
}

// `/value` is the raw read/write Better Auth's storage interface still requires.
export async function handleRateLimitRequest(
  state: DurableObjectState,
  request: Request
): Promise<Response> {
  const { pathname } = new URL(request.url)

  if (request.method !== "POST" && pathname !== "/value") {
    return refuse(405, "This object counts; it serves nothing else.")
  }

  if (pathname === "/fixed") {
    const { key, windowMs, now } = (await request.json()) as FixedHit
    const next = nextFixed(
      await state.storage.get<Stored>(`fixed:${key}`),
      windowMs,
      now ?? Date.now()
    )

    await state.storage.put(`fixed:${key}`, {
      count: next.count,
      at: next.startedAt,
      expiresAt: next.expiresAt,
    })
    await scheduleSweep(state)

    return Response.json({ count: next.count, startedAt: next.startedAt })
  }

  if (pathname === "/rolling") {
    const { key, window, max, now } = (await request.json()) as RollingRule
    const at = now ?? Date.now()
    const next = nextRolling(
      await state.storage.get<Stored>(`roll:${key}`),
      window,
      max,
      at
    )

    await state.storage.put(`roll:${key}`, {
      count: next.count,
      at: next.lastRequest,
      expiresAt: at + window * 1000,
    })
    await scheduleSweep(state)

    return Response.json({ allowed: next.allowed, retryAfter: next.retryAfter })
  }

  if (pathname === "/value") {
    if (request.method === "GET") {
      const key = new URL(request.url).searchParams.get("key")
      const stored = key
        ? read(await state.storage.get<Stored>(`roll:${key}`), Date.now())
        : null

      return Response.json(
        stored ? { key, count: stored.count, lastRequest: stored.at } : null
      )
    }

    const { key, value, windowSeconds } = (await request.json()) as {
      key: string
      value: { count: number; lastRequest: number }
      windowSeconds?: number
    }

    await state.storage.put(`roll:${key}`, {
      count: value.count,
      at: value.lastRequest,
      expiresAt: Date.now() + (windowSeconds ?? 10) * 1000,
    })
    await scheduleSweep(state)

    return new Response(null, { status: 204 })
  }

  return refuse(404, "No such count.")
}

export function shardOf(key: string): number {
  // Kept under 2^31 so the product stays within exact JavaScript integers.
  let hash = 0

  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2_147_483_647
  }

  return hash % SHARDS
}

interface RateLimitNamespace {
  idFromName(name: string): object
  get(id: object): {
    fetch(input: string, init?: RequestInit): Promise<Response>
  }
}

function stub(namespace: RateLimitNamespace, key: string) {
  return namespace.get(namespace.idFromName(String(shardOf(key))))
}

async function post<T>(
  namespace: RateLimitNamespace,
  path: string,
  key: string,
  body: unknown
): Promise<T> {
  const response = await stub(namespace, key).fetch(`${ORIGIN}${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`the rate limit object answered ${response.status}`)
  }

  return (await response.json()) as T
}

// Falls back to isolate memory so a budget never silently disappears.
export function createDurableRateLimitStore(
  namespace: RateLimitNamespace
): RateLimitStore {
  const fallback = createMemoryRateLimitStore()

  return {
    async hit(key, windowMs, now) {
      try {
        return await post<RateLimitCount>(namespace, "/fixed", key, {
          key,
          windowMs,
          now,
        })
      } catch (error) {
        console.error("[rate-limit] falling back to isolate memory", error)

        return await fallback.hit(key, windowMs, now)
      }
    },
  }
}

export function createDurableAuthRateLimitStorage(
  namespace: RateLimitNamespace
): AuthRateLimitStorage {
  return {
    get: async (key) => {
      try {
        const response = await stub(namespace, key).fetch(
          `${ORIGIN}/value?key=${encodeURIComponent(key)}`
        )

        return (await response.json()) as {
          key: string
          count: number
          lastRequest: number
        } | null
      } catch {
        return null
      }
    },
    set: async (key, value) => {
      try {
        await stub(namespace, key).fetch(`${ORIGIN}/value`, {
          method: "PUT",
          body: JSON.stringify({ key, value }),
        })
      } catch {
        // The atomic consume still counts when this write fails.
      }
    },
    consume: async (key, rule) => {
      try {
        return await post<{ allowed: boolean; retryAfter: number | null }>(
          namespace,
          "/rolling",
          key,
          { key, window: rule.window, max: rule.max, now: Date.now() }
        )
      } catch (error) {
        console.error("[rate-limit] auth consume fell back to allowing", error)

        return { allowed: true, retryAfter: null }
      }
    },
  }
}

export function configureRateLimits(env: CloudflareEnv): void {
  configureRateLimitStore(createDurableRateLimitStore(env.RATE_LIMIT))
  configureRateLimitStorage(createDurableAuthRateLimitStorage(env.RATE_LIMIT))
}
