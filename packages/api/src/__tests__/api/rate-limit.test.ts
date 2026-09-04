import { beforeAll, describe, expect, it } from "bun:test"
import { CLIENT_IP_HEADER } from "@pupitre/auth/server"
import { GLOBAL_RATE_LIMIT } from "../../lib/api/rate-limit"
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
})
