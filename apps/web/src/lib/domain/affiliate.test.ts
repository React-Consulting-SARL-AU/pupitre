import { describe, expect, it } from "bun:test"
import {
  affiliateCodeFrom,
  affiliateCookieDomain,
  affiliateCookieFor,
  isAffiliateCode,
} from "@/lib/domain/affiliate"

describe("affiliateCodeFrom", () => {
  it("reads the code among the other cookies", () => {
    expect(
      affiliateCodeFrom("pupitre_locale=fr; pupitre_ref=ada-2026; theme=dark")
    ).toBe("ada-2026")
  })

  it("refuses a code that does not look like one", () => {
    expect(affiliateCodeFrom("pupitre_ref=AD")).toBeNull()
    expect(affiliateCodeFrom("pupitre_ref=Ada 2026")).toBeNull()
    expect(affiliateCodeFrom("pupitre_ref=")).toBeNull()
  })

  it("reads a percent sign as an invalid code instead of throwing", () => {
    expect(affiliateCodeFrom("pupitre_ref=ada%2D2026")).toBeNull()
    expect(affiliateCodeFrom("pupitre_ref=100%")).toBeNull()
  })

  it("says nothing without the cookie", () => {
    expect(affiliateCodeFrom("")).toBeNull()
    expect(affiliateCodeFrom("pupitre_locale=fr")).toBeNull()
    expect(affiliateCodeFrom("pupitre_reference=ada")).toBeNull()
  })
})

describe("isAffiliateCode", () => {
  it("accepts three to thirty-two lowercase letters, digits and dashes", () => {
    expect(isAffiliateCode("ada")).toBe(true)
    expect(isAffiliateCode("a".repeat(32))).toBe(true)
    expect(isAffiliateCode("a".repeat(33))).toBe(false)
    expect(isAffiliateCode("Ada")).toBe(false)
    expect(isAffiliateCode(42)).toBe(false)
  })
})

describe("affiliateCookieFor", () => {
  it("keeps the code ninety days on the console alone", () => {
    expect(affiliateCookieFor("ada-2026", "localhost")).toBe(
      "pupitre_ref=ada-2026; Path=/; Max-Age=7776000; SameSite=Lax"
    )
  })

  it("shares it with the site under the product domain", () => {
    expect(affiliateCookieFor("ada-2026", "app.pupitre.studio")).toBe(
      "pupitre_ref=ada-2026; Path=/; Max-Age=7776000; SameSite=Lax; Domain=.pupitre.studio"
    )
    expect(affiliateCookieFor("ada", "pupitre.studio")).toContain(
      "Domain=.pupitre.studio"
    )
  })

  it("does not mistake a lookalike host for the product domain", () => {
    expect(affiliateCookieFor("ada", "notpupitre.studio")).not.toContain(
      "Domain="
    )
  })
})

describe("affiliateCookieDomain", () => {
  it("shares the cookie on the site's domain and its subdomains", () => {
    expect(affiliateCookieDomain("pupitre.studio")).toBe(".pupitre.studio")
    expect(affiliateCookieDomain("app.pupitre.studio")).toBe(".pupitre.studio")
  })

  it("keeps it on the host anywhere else", () => {
    expect(affiliateCookieDomain("localhost")).toBeNull()
    expect(affiliateCookieDomain("notpupitre.studio")).toBeNull()
  })
})
