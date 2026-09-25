import { describe, expect, it } from "bun:test"
import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import { type MessageKey, translate } from "./index"

describe("translate", () => {
  it("fills parameters in both languages", () => {
    expect(translate("fr", "internal", { ref: "abc" })).toContain("abc")
    expect(translate("en", "internal", { ref: "abc" })).toContain("abc")
    expect(translate("fr", "unauthenticated")).not.toBe(
      translate("en", "unauthenticated")
    )
  })

  it("names the shared support address wherever a fix sends the reader to support", () => {
    const keys: MessageKey[] = [
      "account_deactivated_fix",
      "account_suspended_fix",
      "organization_closed_fix",
      "launch_subscription_ended_fix",
    ]

    for (const key of keys) {
      expect(translate("fr", key)).toContain(LEGAL_CONTACTS.support)
      expect(translate("en", key)).toContain(LEGAL_CONTACTS.support)
    }
  })
})
