import { beforeAll, describe, expect, it } from "bun:test"
import { Elysia } from "elysia"
import { hiddenRoutes } from "../../lib/api/routes"
import { createApi } from "../../server"
import { bootApiTestServer, TEST_BASE_URL } from "../../testing"

const OPENAPI_3_RE = /^3\./

interface OpenApiDocument {
  openapi: string
  paths: Record<string, unknown>
}

async function documentOf(api: ReturnType<typeof createApi>) {
  const response = await api.handle(
    new Request(`${TEST_BASE_URL}/api/v1/openapi/json`)
  )

  return {
    status: response.status,
    doc: (await response.json()) as OpenApiDocument,
  }
}

describe("GET /api/v1/openapi", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  it("serves the reference and its document", async () => {
    const { fetch } = await bootApiTestServer()
    const reference = await fetch(`${TEST_BASE_URL}/api/v1/openapi`)

    expect(reference.status).toBe(200)
    expect(reference.headers.get("content-type")).toContain("text/html")

    const document = await fetch(`${TEST_BASE_URL}/api/v1/openapi/json`)
    const doc = (await document.json()) as OpenApiDocument

    expect(document.status).toBe(200)
    expect(doc.openapi).toMatch(OPENAPI_3_RE)
    expect(Object.keys(doc.paths)).toContain("/api/v1/health")
    expect(Object.keys(doc.paths)).toContain("/api/v1/me")
    expect(Object.keys(doc.paths)).toContain("/api/v1/servers")
    expect(Object.keys(doc.paths)).toContain("/api/v1/agent/state")
    expect(Object.keys(doc.paths).some((path) => path.includes("/admin"))).toBe(
      false
    )
  })

  it("hides every route mounted under the hidden group while keeping it reachable", async () => {
    const api = createApi(
      new Elysia()
        .get("/visible", () => ({ ok: true }))
        .use(
          hiddenRoutes(
            new Elysia({ prefix: "/admin" }).get("/dummy", () => ({ ok: true }))
          )
        )
    )
    const { status, doc } = await documentOf(api)

    expect(status).toBe(200)
    expect(Object.keys(doc.paths)).toContain("/api/v1/visible")
    expect(Object.keys(doc.paths)).not.toContain("/api/v1/admin/dummy")

    const reachable = await api.handle(
      new Request(`${TEST_BASE_URL}/api/v1/admin/dummy`)
    )

    expect(reachable.status).toBe(200)
  })
})
