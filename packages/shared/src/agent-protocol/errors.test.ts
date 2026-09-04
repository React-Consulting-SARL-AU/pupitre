import { describe, expect, it } from "bun:test"
import {
  PROTOCOL_ERROR_CODES,
  ProtocolErrorCodeSchema,
  ProtocolErrorSchema,
  RemedySchema,
} from "./errors"

describe("ProtocolErrorCodeSchema", () => {
  it("lists the codes named by the contract", () => {
    for (const code of [
      "hello_required",
      "protocol_mismatch",
      "bad_request",
      "unknown_command",
      "entitlement_required",
      "project_not_found",
      "module_failed",
      "no_report",
      "bad_signature",
      "downgrade_refused",
    ]) {
      expect(PROTOCOL_ERROR_CODES as readonly string[]).toContain(code)
      expect(ProtocolErrorCodeSchema.safeParse(code).success).toBe(true)
    }
  })

  it("rejects a code the contract does not know", () => {
    expect(ProtocolErrorCodeSchema.safeParse("invalid_request").success).toBe(
      false
    )
  })
})

describe("ProtocolErrorSchema", () => {
  it("accepts a code with a message and an optional fix", () => {
    expect(
      ProtocolErrorSchema.safeParse({
        code: "protocol_mismatch",
        message: "Expected protocol 1",
      }).success
    ).toBe(true)
    expect(
      ProtocolErrorSchema.safeParse({
        code: "entitlement_required",
        message: "Subscription expired",
        fix: "https://app.pupitre.studio/billing",
      }).success
    ).toBe(true)
  })

  it("rejects a missing message", () => {
    expect(ProtocolErrorSchema.safeParse({ code: "bad_request" }).success).toBe(
      false
    )
  })
})

describe("RemedySchema", () => {
  it("carries a free port as a number, not as a sentence", () => {
    const parsed = RemedySchema.safeParse({
      code: "port_taken",
      port_free: 3001,
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual({ code: "port_taken", port_free: 3001 })
  })

  it("rejects a port written as text, and an unknown remedy", () => {
    expect(
      RemedySchema.safeParse({ code: "port_taken", port_free: "3001" }).success
    ).toBe(false)
    expect(
      RemedySchema.safeParse({ code: "name_taken", port_free: 3001 }).success
    ).toBe(false)
  })

  it("rides on the error beside its fix", () => {
    const parsed = ProtocolErrorSchema.safeParse({
      code: "bad_request",
      message: "le port 3000 est déjà pris par web",
      fix: "Donne un autre port à api, par exemple 3001.",
      remedy: { code: "port_taken", port_free: 3001 },
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data?.remedy).toEqual({ code: "port_taken", port_free: 3001 })
  })
})
