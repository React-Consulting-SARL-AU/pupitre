import { describe, expect, it } from "bun:test"
import {
  PrismaClient,
  ReleaseChannel,
  ServerStatus,
} from "./generated/prisma/client"
import {
  PrismaClient as CloudflarePrismaClient,
  ServerStatus as CloudflareServerStatus,
} from "./generated/prisma-cloudflare/client"

describe("generated clients", () => {
  it("exposes a Node client and a Cloudflare client", () => {
    expect(typeof PrismaClient).toBe("function")
    expect(typeof CloudflarePrismaClient).toBe("function")
  })

  it("exposes the contract enums with their exact values", () => {
    expect(Object.values(ServerStatus)).toEqual([
      "enrolling",
      "active",
      "grace",
      "suspended",
      "revoked",
    ])
    expect(Object.values(ReleaseChannel)).toEqual(["stable", "beta"])
    expect(CloudflareServerStatus).toEqual(ServerStatus)
  })
})
