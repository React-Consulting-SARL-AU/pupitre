import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { neonPrismaClient, withNeonPrismaClient } from "./neon"

const FAKE_URL = "postgresql://user:password@localhost:5432/neondb"

let previous: string | undefined

beforeEach(() => {
  previous = process.env.DATABASE_URL
  process.env.DATABASE_URL = FAKE_URL
})

afterEach(() => {
  if (previous === undefined) {
    process.env.DATABASE_URL = undefined
  } else {
    process.env.DATABASE_URL = previous
  }
})

describe("neon client scope", () => {
  it("hands the same client to every reader of one scope", async () => {
    const [first, second] = await withNeonPrismaClient(() =>
      Promise.resolve([neonPrismaClient(), neonPrismaClient()])
    )

    expect(first).toBe(second)
  })

  it("never shares a client between two scopes", async () => {
    const first = await withNeonPrismaClient(() =>
      Promise.resolve(neonPrismaClient())
    )
    const second = await withNeonPrismaClient(() =>
      Promise.resolve(neonPrismaClient())
    )

    expect(first).not.toBe(second)
  })

  it("keeps no client outside a scope", () => {
    expect(neonPrismaClient()).not.toBe(neonPrismaClient())
  })

  it("refuses to build a client without a connection string", () => {
    process.env.DATABASE_URL = undefined

    expect(() => neonPrismaClient()).toThrow("DATABASE_URL is not set")
  })
})
