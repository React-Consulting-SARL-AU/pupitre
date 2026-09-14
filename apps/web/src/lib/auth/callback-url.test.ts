import { describe, expect, it } from "bun:test"
import { DEFAULT_CALLBACK_URL, safeCallbackUrl } from "@/lib/auth/callback-url"

const ORIGIN = "https://app.pupitre.test"

describe("safeCallbackUrl", () => {
  it("keeps a path of this origin, with its query", () => {
    expect(safeCallbackUrl("/auth/device?user_code=ABCDEFGH", ORIGIN)).toBe(
      "/auth/device?user_code=ABCDEFGH"
    )
    expect(safeCallbackUrl(`${ORIGIN}/dashboard/billing`, ORIGIN)).toBe(
      "/dashboard/billing"
    )
  })

  it("falls back to the servers list when nothing is asked", () => {
    expect(safeCallbackUrl(undefined, ORIGIN)).toBe(DEFAULT_CALLBACK_URL)
    expect(safeCallbackUrl("", ORIGIN)).toBe(DEFAULT_CALLBACK_URL)
    expect(safeCallbackUrl(42, ORIGIN)).toBe(DEFAULT_CALLBACK_URL)
  })

  it("drops anything pointing off this origin", () => {
    expect(safeCallbackUrl("https://evil.test/auth/device", ORIGIN)).toBe(
      DEFAULT_CALLBACK_URL
    )
    expect(safeCallbackUrl("//evil.test/auth/device", ORIGIN)).toBe(
      DEFAULT_CALLBACK_URL
    )
    expect(safeCallbackUrl("javascript:alert(1)", ORIGIN)).toBe(
      DEFAULT_CALLBACK_URL
    )
  })
})
