import { describe, expect, it, spyOn } from "bun:test"
import { ApiErrorBodySchema } from "@pupitre/shared/api/errors"
import { Elysia, t } from "elysia"
import { createApi } from "../../server"

const REF_RE = /[0-9a-f]{12}/

const probeRoutes = new Elysia()
  .post("/echo", ({ body }) => body, {
    body: t.Object({
      name: t.String({ minLength: 2 }),
      count: t.Optional(t.Integer({ minimum: 1 })),
      nested: t.Optional(t.Object({ flag: t.Boolean() })),
    }),
  })
  .get("/boom", () => {
    throw new Error("secret database details")
  })
  .get("/leak", () => {
    throw Object.assign(new Error("Unique constraint failed"), {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      meta: { target: ["email"], values: ["ada@private.example"] },
    })
  })

const api = createApi(probeRoutes)

async function call(
  path: string,
  init: RequestInit & { json?: unknown; locale?: string } = {}
) {
  const headers = new Headers(init.headers)

  if (init.json !== undefined) {
    headers.set("content-type", "application/json")
  }

  if (init.locale) {
    headers.set("accept-language", init.locale)
  }

  const response = await api.handle(
    new Request(`http://localhost/api/v1${path}`, {
      method: init.method ?? (init.json === undefined ? "GET" : "POST"),
      headers,
      body: init.json === undefined ? init.body : JSON.stringify(init.json),
    })
  )
  const text = await response.text()

  return { status: response.status, json: JSON.parse(text) }
}

describe("API error envelope", () => {
  it("answers a validation error in English by default, naming the field", async () => {
    const response = await call("/echo", { json: { name: "a" } })

    expect(response.status).toBe(422)
    expect(response.json.error.code).toBe("validation")
    expect(response.json.error.message).toContain("name")
    expect(response.json.error.message).toContain("invalid")
    expect(response.json.error.fix).toContain("2")
  })

  it("answers the same validation error in French from Accept-Language", async () => {
    const response = await call("/echo", {
      json: { name: "a" },
      locale: "fr-FR,fr;q=0.9,en;q=0.8",
    })

    expect(response.status).toBe(422)
    expect(response.json.error.code).toBe("validation")
    expect(response.json.error.message).toContain("name")
    expect(response.json.error.message).toContain("invalide")
    expect(response.json.error.fix).toContain("2")
  })

  it("names a missing field and a nested path", async () => {
    const missing = await call("/echo", { json: {}, locale: "en" })
    const nested = await call("/echo", {
      json: { name: "ok", nested: { flag: "yes" } },
      locale: "en",
    })

    expect(missing.json.error.message).toContain("name")
    expect(missing.json.error.fix).toContain("required")
    expect(nested.json.error.message).toContain("nested.flag")
    expect(nested.json.error.fix).toContain("boolean")
  })

  it("answers an unreadable body as a validation error", async () => {
    const response = await call("/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    })

    expect(response.status).toBe(400)
    expect(response.json.error.code).toBe("validation")
  })

  it("answers not_found for an unknown route", async () => {
    const response = await call("/nope")

    expect(response.status).toBe(404)
    expect(response.json.error.code).toBe("not_found")
  })

  it("hides the cause of an unexpected error behind a logged reference", async () => {
    const response = await call("/boom")

    expect(response.status).toBe(500)
    expect(response.json.error.code).toBe("internal")
    expect(response.json.error.message).toMatch(REF_RE)
    expect(JSON.stringify(response.json)).not.toContain("secret database")
    expect(JSON.stringify(response.json)).not.toContain("at ")
  })

  it("logs the reference, the name and the code of an unexpected error, never the error itself", async () => {
    const lines: string[] = []
    const logged = spyOn(console, "error").mockImplementation(
      (...parts: unknown[]) => {
        lines.push(parts.map((part) => JSON.stringify(part)).join(" "))
      }
    )

    try {
      const response = await call("/leak")

      expect(response.status).toBe(500)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain("P2002")
      expect(lines[0]).toContain("PrismaClientKnownRequestError")
      expect(lines[0]).toMatch(REF_RE)
      expect(lines[0]).not.toContain("ada@private.example")
      expect(lines[0]).not.toContain("at ")
    } finally {
      logged.mockRestore()
    }
  })

  it("keeps the single error shape on every failure", async () => {
    const failures = await Promise.all([
      call("/echo", { json: { name: "a" } }),
      call("/echo", { json: { name: "ok", count: 0 }, locale: "en" }),
      call("/nope"),
      call("/boom"),
    ])

    for (const failure of failures) {
      expect(ApiErrorBodySchema.safeParse(failure.json).success).toBe(true)
    }
  })
})
