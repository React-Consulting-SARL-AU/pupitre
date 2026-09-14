import { describe, expect, it } from "bun:test"
import {
  EmptyParamsSchema,
  EntitlementSchema,
  HelloParamsSchema,
  HelloResultSchema,
  PingResultSchema,
} from "./session"

describe("HelloParamsSchema", () => {
  it("accepts the app version and an integer protocol", () => {
    expect(
      HelloParamsSchema.safeParse({ app_version: "1.2.0", protocol: 1 }).success
    ).toBe(true)
  })

  it("rejects a non-integer protocol and an unknown key", () => {
    expect(
      HelloParamsSchema.safeParse({ app_version: "1.2.0", protocol: "1" })
        .success
    ).toBe(false)
    expect(
      HelloParamsSchema.safeParse({
        app_version: "1.2.0",
        protocol: 2,
        extra: true,
      }).success
    ).toBe(false)
  })
})

describe("HelloResultSchema", () => {
  it("accepts a full and a minimal answer", () => {
    expect(
      HelloResultSchema.safeParse({
        agent_version: "0.3.1",
        protocol: 2,
        server_id: "srv_01H",
        entitlement: "valid",
        capabilities: ["projects", "tunnel"],
      }).success
    ).toBe(true)
    expect(
      HelloResultSchema.safeParse({
        agent_version: "0.3.1",
        protocol: 2,
        entitlement: "dev",
        capabilities: [],
      }).success
    ).toBe(true)
  })

  it("rejects an unknown entitlement", () => {
    expect(
      HelloResultSchema.safeParse({
        agent_version: "0.3.1",
        protocol: 2,
        entitlement: "trial",
        capabilities: [],
      }).success
    ).toBe(false)
    expect(EntitlementSchema.safeParse("suspended").success).toBe(false)
  })
})

describe("PingResultSchema", () => {
  it("accepts a timestamp and rejects its absence", () => {
    expect(
      PingResultSchema.safeParse({ ts: "2026-09-04T10:00:00Z" }).success
    ).toBe(true)
    expect(PingResultSchema.safeParse({}).success).toBe(false)
  })
})

describe("EmptyParamsSchema", () => {
  it("accepts an empty object and rejects any key", () => {
    expect(EmptyParamsSchema.safeParse({}).success).toBe(true)
    expect(EmptyParamsSchema.safeParse({ name: "x" }).success).toBe(false)
  })
})
