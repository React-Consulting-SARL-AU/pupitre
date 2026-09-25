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
    expect(safeCallbackUrl("/auth/invitation/abc123", ORIGIN)).toBe(
      "/auth/invitation/abc123"
    )
    expect(safeCallbackUrl("/dashboard/servers?q=a%2Fb", ORIGIN)).toBe(
      "/dashboard/servers?q=a%2Fb"
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
    expect(safeCallbackUrl("http://app.pupitre.test/dashboard", ORIGIN)).toBe(
      DEFAULT_CALLBACK_URL
    )
    expect(safeCallbackUrl(`${ORIGIN}@evil.test/dashboard`, ORIGIN)).toBe(
      DEFAULT_CALLBACK_URL
    )
    expect(safeCallbackUrl(" //evil.test", ORIGIN)).toBe(DEFAULT_CALLBACK_URL)
  })

  it.each([
    `${ORIGIN}//evil.test`,
    `${ORIGIN}//evil.test/dashboard?x=1`,
    `${ORIGIN}/\\evil.test`,
    `${ORIGIN}/.//evil.test`,
    `${ORIGIN}/..//evil.test`,
    "/.//evil.test",
    "/\\evil.test",
    "\\\\evil.test",
    "/\\/evil.test",
  ])("drops %p, a path the browser reads as another host", (payload) => {
    expect(safeCallbackUrl(payload, ORIGIN)).toBe(DEFAULT_CALLBACK_URL)
  })

  it.each([
    "/%2F%2Fevil.test",
    "/%2f%2fevil.test",
    "/%2F/evil.test",
    "/%5Cevil.test",
    "/%5cevil.test",
    "/%5C%5Cevil.test",
    "/%252F%252Fevil.test",
    "/%25252F%25252Fevil.test",
    `${ORIGIN}/%2F%2Fevil.test`,
    `${ORIGIN}/%5Cevil.test`,
    "/dashboard/%5Cservers",
    "/%09/evil.test",
    "/%0A/evil.test",
    "/%00/evil.test",
  ])("drops %p, an encoded path that decodes into another host", (payload) => {
    expect(safeCallbackUrl(payload, ORIGIN)).toBe(DEFAULT_CALLBACK_URL)
  })

  it.each([
    "/\t/evil.test",
    "/\n/evil.test",
    "/\r\n/evil.test",
    `${ORIGIN}/\t/evil.test`,
    `${ORIGIN}/\n/evil.test`,
    "/dash\tboard",
    "/dashboard\u0000",
    "/dashboard\\servers",
  ])(
    "drops %p, which carries a character the browser strips or rewrites",
    (payload) => {
      expect(safeCallbackUrl(payload, ORIGIN)).toBe(DEFAULT_CALLBACK_URL)
    }
  )

  it("drops a path that does not decode", () => {
    expect(safeCallbackUrl("/%E0%A4%A", ORIGIN)).toBe(DEFAULT_CALLBACK_URL)
  })
})
