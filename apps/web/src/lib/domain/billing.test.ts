import { describe, expect, it } from "bun:test"
import {
  opensBillingPortal,
  subscriptionStatusLook,
} from "@/lib/domain/billing"

describe("subscriptionStatusLook", () => {
  it("reads an active subscription as a filled dot", () => {
    expect(subscriptionStatusLook("active")).toEqual({
      shape: "filled",
      tone: "ok",
      label: "billing.status.active",
    })
  })

  it("reads a late payment as a warning", () => {
    expect(subscriptionStatusLook("past_due")?.tone).toBe("warn")
  })

  it("has no look for a status Stripe invented after us", () => {
    expect(subscriptionStatusLook("weird_new_status")).toBeNull()
  })
})

describe("opensBillingPortal", () => {
  it("opens the portal of a Stripe subscription while Stripe bills", () => {
    expect(opensBillingPortal({ product: "stripe" }, "stripe")).toBe(true)
    expect(opensBillingPortal({ product: "prod_server" }, "stripe")).toBe(true)
  })

  it("keeps it closed while billing is off, whatever the subscription", () => {
    expect(opensBillingPortal({ product: "stripe" }, "off")).toBe(false)
    expect(opensBillingPortal({ product: "stripe" }, undefined)).toBe(false)
  })

  it("never opens it for a licence the platform granted, nor without a subscription", () => {
    expect(opensBillingPortal({ product: "granted" }, "stripe")).toBe(false)
    expect(opensBillingPortal({ product: null }, "stripe")).toBe(false)
    expect(opensBillingPortal(null, "stripe")).toBe(false)
  })
})
