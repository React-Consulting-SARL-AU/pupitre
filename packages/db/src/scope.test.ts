import { describe, expect, it } from "bun:test"
import type { PrismaClient } from "./generated/prisma-cloudflare/client"
import {
  currentPrismaClient,
  scopedPrismaClient,
  withPrismaClient,
} from "./scope"

function fake(name: string): PrismaClient {
  return { name, count: () => name } as unknown as PrismaClient
}

describe("the request's Prisma client", () => {
  it("is the one the scope holds, for the whole scope", async () => {
    const [first, second] = await withPrismaClient(fake("a"), () =>
      Promise.resolve([currentPrismaClient(), currentPrismaClient()])
    )

    expect(first).toBe(second)
  })

  it("differs from one scope to the next, and the proxy follows the scope", async () => {
    const proxy = scopedPrismaClient() as unknown as { count: () => string }

    expect(await withPrismaClient(fake("a"), () => proxy.count())).toBe("a")
    expect(await withPrismaClient(fake("b"), () => proxy.count())).toBe("b")
  })

  it("refuses to answer outside any scope", () => {
    expect(() => currentPrismaClient()).toThrow("no Prisma client in scope")
  })
})
