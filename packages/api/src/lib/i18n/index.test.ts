import { describe, expect, it } from "bun:test"
import { resolveLocale, translate } from "./index"

function headers(acceptLanguage?: string): Headers {
  return new Headers(
    acceptLanguage === undefined ? {} : { "accept-language": acceptLanguage }
  )
}

describe("resolveLocale", () => {
  it("defaults to French", () => {
    expect(resolveLocale(headers())).toBe("fr")
    expect(resolveLocale(headers("de-DE,de;q=0.9"))).toBe("fr")
  })

  it("honours the best supported language by quality", () => {
    expect(resolveLocale(headers("en-US,en;q=0.9,fr;q=0.8"))).toBe("en")
    expect(resolveLocale(headers("de;q=0.9,en;q=0.5,fr;q=0.7"))).toBe("fr")
    expect(resolveLocale(headers("EN"))).toBe("en")
  })
})

describe("translate", () => {
  it("fills parameters in both languages", () => {
    expect(translate("fr", "internal", { ref: "abc" })).toContain("abc")
    expect(translate("en", "internal", { ref: "abc" })).toContain("abc")
    expect(translate("fr", "unauthenticated")).not.toBe(
      translate("en", "unauthenticated")
    )
  })
})
