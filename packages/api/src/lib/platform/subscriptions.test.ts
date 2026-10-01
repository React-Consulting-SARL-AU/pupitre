import { describe, expect, it } from "bun:test"
import { allowedSubscriptionActions } from "./subscriptions"

function actionsOf(product: string, status: string, cancelAtPeriodEnd = false) {
  return allowedSubscriptionActions({ product, status, cancelAtPeriodEnd })
}

describe("allowedSubscriptionActions", () => {
  it("stops anything that is not already cancelled", () => {
    expect(actionsOf("prod_server", "active")).toContain("cancel")
    expect(actionsOf("prod_server", "past_due")).toContain("cancel")
    expect(actionsOf("prod_server", "canceled")).not.toContain("cancel")
  })

  it("deletes a platform row whatever its status", () => {
    expect(actionsOf("granted", "canceled")).toContain("delete")
    expect(actionsOf("granted", "active")).toContain("delete")
  })

  it("deletes a Stripe row only once Stripe no longer bills it", () => {
    expect(actionsOf("prod_server", "canceled")).toContain("delete")
    expect(actionsOf("prod_server", "active")).not.toContain("delete")
    expect(actionsOf("prod_server", "past_due")).not.toContain("delete")
  })

  it("resizes the granted product alone", () => {
    expect(actionsOf("granted", "active")).toContain("resize")
    expect(actionsOf("prod_server", "active")).not.toContain("resize")
  })

  it("takes back a Stripe cancellation that still runs to the end of the period", () => {
    expect(actionsOf("prod_server", "active", true)).toContain("resume")
    expect(actionsOf("prod_server", "active", false)).not.toContain("resume")
    expect(actionsOf("prod_server", "canceled", true)).not.toContain("resume")
    expect(actionsOf("granted", "active", true)).not.toContain("resume")
  })

  it("lists the actions in one order, whatever the row", () => {
    expect(actionsOf("granted", "active")).toEqual([
      "resize",
      "cancel",
      "delete",
    ])
  })
})
