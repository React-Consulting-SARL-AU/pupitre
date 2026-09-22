import { beforeAll, describe, expect, it } from "bun:test"
import { CLIENT_IP_HEADER } from "@pupitre/auth/server"
import {
  configureRateLimitStore,
  createRateLimiter,
  GLOBAL_RATE_LIMIT,
} from "../../lib/api/rate-limit"
import { handleApiRequest } from "../../server"
import { bootApiTestServer } from "../../testing"
import { apiRequest } from "../../testing/request"

describe("global rate limit", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  it("answers 429 past the per-IP budget and keeps other clients unaffected", async () => {
    const flooding = { [CLIENT_IP_HEADER]: "198.51.100.10" }
    const statuses = new Set<number>()

    for (let attempt = 0; attempt < GLOBAL_RATE_LIMIT.limit; attempt += 1) {
      statuses.add((await apiRequest("/health", { headers: flooding })).status)
    }

    expect(statuses).toEqual(new Set([200]))

    const limited = await apiRequest("/health", { headers: flooding })

    expect(limited.status).toBe(429)
    expect(limited.json).toMatchObject({ error: { code: "rate_limited" } })
    expect(Number(limited.raw.headers.get("retry-after"))).toBeGreaterThan(0)

    const neighbour = await apiRequest("/health", {
      headers: { [CLIENT_IP_HEADER]: "198.51.100.11" },
    })

    expect(neighbour.status).toBe(200)
  })

  it("counts a caller the edge did not sign, instead of letting it pass", async () => {
    const statuses = new Set<number>()

    for (let attempt = 0; attempt <= GLOBAL_RATE_LIMIT.limit; attempt += 1) {
      statuses.add(
        (await handleApiRequest(new Request("http://localhost/api/v1/health")))
          .status
      )
    }

    expect(statuses.has(429)).toBe(true)
  })
})

describe("rate limiter stores", () => {
  it("counts against a configured shared store, keyed and windowed as asked", async () => {
    const hits: { key: string; windowMs: number }[] = []
    configureRateLimitStore({
      hit: async (key, windowMs) => {
        hits.push({ key, windowMs })

        return { count: hits.length, startedAt: 1000 }
      },
    })

    try {
      const limiter = createRateLimiter({ limit: 1, windowMs: 5000 })
      const first = await limiter.check("releases:198.51.100.10")
      const second = await limiter.check("releases:198.51.100.10")

      expect(first).toEqual({ allowed: true, retryAfterSeconds: 0 })
      expect(second).toMatchObject({ allowed: false })
      expect(second.retryAfterSeconds).toBeGreaterThan(0)
      expect(hits).toEqual([
        { key: "releases:198.51.100.10", windowMs: 5000 },
        { key: "releases:198.51.100.10", windowMs: 5000 },
      ])
    } finally {
      configureRateLimitStore(null)
    }
  })

  it("keeps counting on the memory store once the shared one is gone", async () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 })

    expect(await limiter.check("a", 10_000)).toMatchObject({ allowed: true })
    expect(await limiter.check("a", 10_000)).toMatchObject({ allowed: true })
    expect(await limiter.check("a", 10_000)).toMatchObject({ allowed: false })
    expect(await limiter.check("b", 10_000)).toMatchObject({ allowed: true })
  })
})
