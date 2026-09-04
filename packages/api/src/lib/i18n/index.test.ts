import { describe, expect, it } from "bun:test"
import { translate } from "./index"

describe("translate", () => {
  it("fills parameters in both languages", () => {
    expect(translate("fr", "internal", { ref: "abc" })).toContain("abc")
    expect(translate("en", "internal", { ref: "abc" })).toContain("abc")
    expect(translate("fr", "unauthenticated")).not.toBe(
      translate("en", "unauthenticated")
    )
  })
})
