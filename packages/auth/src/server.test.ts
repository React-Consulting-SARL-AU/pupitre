import { describe, expect, it } from "bun:test"
import type { PrismaClient } from "@pupitre/db/cloudflare/client"
import { createAuth } from "./server"

describe("createAuth", () => {
  it("builds a Better Auth instance with a request handler", () => {
    const auth = createAuth({} as PrismaClient, {
      baseURL: "http://localhost:3000",
      secret: "test-secret-test-secret-test-secret",
    })

    expect(typeof auth.handler).toBe("function")
    expect(auth.options.baseURL).toBe("http://localhost:3000")
  })
})
