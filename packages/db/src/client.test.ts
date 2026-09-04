import { describe, expect, it } from "bun:test"
import { PrismaClient } from "./generated/prisma/client"
import { PrismaClient as CloudflarePrismaClient } from "./generated/prisma-cloudflare/client"

describe("generated clients", () => {
  it("exposes a Node client and a Cloudflare client", () => {
    expect(typeof PrismaClient).toBe("function")
    expect(typeof CloudflarePrismaClient).toBe("function")
  })
})
