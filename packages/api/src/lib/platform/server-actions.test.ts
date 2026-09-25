import { describe, expect, it } from "bun:test"
import { allowedServerActions } from "./server-actions"

function actionsOf(
  status: string,
  suspendedReason: string | null = null,
  acts = true
) {
  return allowedServerActions(
    { status, suspended_reason: suspendedReason },
    acts
  )
}

describe("allowedServerActions", () => {
  it("leaves a platform member with nothing to do", () => {
    expect(actionsOf("active", null, false)).toEqual([])
    expect(actionsOf("suspended", "admin", false)).toEqual([])
  })

  it("suspends a running server alone", () => {
    expect(actionsOf("active")).toContain("suspend")

    for (const status of ["enrolling", "grace", "suspended", "revoked"]) {
      expect(actionsOf(status), status).not.toContain("suspend")
    }
  })

  it("lifts only the suspension the team laid", () => {
    expect(actionsOf("suspended", "admin")).toContain("restore")
    expect(actionsOf("suspended", "billing")).not.toContain("restore")
    expect(actionsOf("revoked", "admin")).not.toContain("restore")
  })

  it("moves the channel of any server still enrolled", () => {
    expect(actionsOf("active")).toContain("set_channel")
    expect(actionsOf("revoked")).not.toContain("set_channel")
  })

  it("lists the actions in one order, whatever the server", () => {
    expect(actionsOf("active")).toEqual([
      "set_channel",
      "clear_alerts",
      "suspend",
      "delete",
    ])
    expect(actionsOf("suspended", "admin")).toEqual([
      "set_channel",
      "clear_alerts",
      "restore",
      "delete",
    ])
  })
})
