import { describe, expect, it } from "bun:test"
import { opensWithoutConsent, sendsToConsent } from "./consent-gate"

const AGREED = { version: "2026-10-02", accepted_at: "2026-10-02T10:00:00Z" }

describe("the consent gate", () => {
  it("lets through an account that agreed to the current text", () => {
    expect(
      sendsToConsent({ consent: AGREED, pathname: "/dashboard/servers" })
    ).toBe(false)
  })

  it("sends every console page to the consent until the account agrees", () => {
    for (const pathname of [
      "/dashboard",
      "/dashboard/servers",
      "/dashboard/billing",
      "/dashboard/admin",
      "/dashboard/devices",
    ]) {
      expect(sendsToConsent({ consent: null, pathname }), pathname).toBe(true)
    }
  })

  it("leaves the account settings open, since deleting the account withdraws the consent", () => {
    expect(opensWithoutConsent("/dashboard/settings")).toBe(true)
    expect(opensWithoutConsent("/dashboard/settings/")).toBe(true)
    expect(
      sendsToConsent({ consent: null, pathname: "/dashboard/settings" })
    ).toBe(false)
  })
})
