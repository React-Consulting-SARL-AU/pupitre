import { describe, expect, it } from "bun:test"
import { app, handleApiRequest } from "./server"

function body(response: Response): Promise<unknown> {
  return response.json()
}

describe("GET /api/v1/health", () => {
  it("answers ok through the Elysia app", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/v1/health")
    )

    expect(response.status).toBe(200)
    expect(await body(response)).toEqual({ ok: true })
  })

  it("answers ok through handleApiRequest", async () => {
    const response = await handleApiRequest(
      new Request("http://localhost/api/v1/health")
    )

    expect(response.status).toBe(200)
    expect(await body(response)).toEqual({ ok: true })
  })

  it("answers 404 outside the prefix", async () => {
    const response = await handleApiRequest(
      new Request("http://localhost/health")
    )

    expect(response.status).toBe(404)
  })
})
