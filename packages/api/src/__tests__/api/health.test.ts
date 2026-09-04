import { beforeAll, describe, expect, it } from "bun:test"
import { bootApiTestServer, TEST_BASE_URL } from "../../testing"
import { apiRequest } from "../../testing/request"

describe("GET /health", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  it("answers ok without any session", async () => {
    const health = await apiRequest<{ ok: boolean }>("/health")

    expect(health.status).toBe(200)
    expect(health.json).toEqual({ ok: true })
  })

  it("answers 404 outside the /api/v1 prefix", async () => {
    const { fetch } = await bootApiTestServer()
    const response = await fetch(`${TEST_BASE_URL}/health`)

    expect(response.status).toBe(404)
  })
})
