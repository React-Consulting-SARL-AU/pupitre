import { describe, expect, it } from "bun:test"
import {
  AFFILIATE_LINK_TAB,
  AFFILIATE_LINK_TABS,
  affiliateCodeFrom,
  affiliateCookieDomain,
  affiliateCookieFor,
  affiliateCookieToWrite,
  affiliateLinkTab,
  affiliateLinkTabFor,
  affiliateReachFigures,
  filterAffiliateLinks,
  isAffiliateCode,
} from "@/lib/domain/affiliate"

const LINKS = [
  {
    name: "Salon des makers",
    code: "makers",
    partner_name: "Ada Lovelace",
    disabled: false,
  },
  { name: "Podcast", code: "podcast-42", partner_name: null, disabled: true },
]

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
    expect(affiliateCookieFor("ada-2026", "localhost", false)).toBe(
      "pupitre_ref=ada-2026; Path=/; Max-Age=7776000; SameSite=Lax"
    )
  })

  it("shares it with the site under the product domain, over https only", () => {
    expect(affiliateCookieFor("ada-2026", "app.pupitre.studio", true)).toBe(
      "pupitre_ref=ada-2026; Path=/; Max-Age=7776000; SameSite=Lax; Secure; Domain=.pupitre.studio"
    )
    expect(affiliateCookieFor("ada", "pupitre.studio", true)).toContain(
      "Domain=.pupitre.studio"
    )
  })

  it("does not mistake a lookalike host for the product domain", () => {
    expect(affiliateCookieFor("ada", "notpupitre.studio", true)).not.toContain(
      "Domain="
    )
  })
})

describe("affiliateCookieToWrite", () => {
  it("credits the first link that brought the visitor, not a later one", () => {
    expect(
      affiliateCookieToWrite(
        "pupitre_ref=first-touch",
        "later",
        "localhost",
        false
      )
    ).toBeNull()
  })

  it("writes the code when none was kept, or the one kept is unreadable", () => {
    expect(affiliateCookieToWrite("", "ada", "localhost", false)).toBe(
      affiliateCookieFor("ada", "localhost", false)
    )
    expect(
      affiliateCookieToWrite("pupitre_ref=AD", "ada", "localhost", false)
    ).toBe(affiliateCookieFor("ada", "localhost", false))
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

describe("filterAffiliateLinks", () => {
  it("matches the name, the code and the partner, whatever the case", () => {
    expect(
      filterAffiliateLinks(LINKS, { query: " MAKERS ", disabled: undefined })
    ).toEqual([LINKS[0]])
    expect(
      filterAffiliateLinks(LINKS, { query: "podcast-4", disabled: undefined })
    ).toEqual([LINKS[1]])
    expect(
      filterAffiliateLinks(LINKS, { query: "lovelace", disabled: undefined })
    ).toEqual([LINKS[0]])
  })

  it("keeps the state asked for, and everything when none is", () => {
    expect(filterAffiliateLinks(LINKS, { query: "", disabled: true })).toEqual([
      LINKS[1],
    ])
    expect(filterAffiliateLinks(LINKS, { query: "", disabled: false })).toEqual(
      [LINKS[0]]
    )
    expect(
      filterAffiliateLinks(LINKS, { query: "", disabled: undefined })
    ).toHaveLength(2)
  })
})

describe("affiliateReachFigures", () => {
  it("follows the visitor from the click to the server installed", () => {
    const figures = affiliateReachFigures({
      clicks: { total: 40, last_30_days: 12 },
      conversion: { referred: 4, servers: 6 },
    })

    expect(figures.map((figure) => figure.id)).toEqual([
      "clicks",
      "clicks_30_days",
      "referred",
      "servers",
    ])
    expect(figures[2]).toMatchObject({
      label: "admin.links.conversion.referred",
      value: 4,
    })
    expect(figures.at(-1)?.value).toBe(6)
  })
})

describe("affiliateLinkTabFor", () => {
  it("gives a reader the overview instead of the settings and the danger", () => {
    expect(affiliateLinkTabFor("settings", false)).toBe("overview")
    expect(affiliateLinkTabFor("danger", false)).toBe("overview")
    expect(affiliateLinkTabFor("organizations", false)).toBe("organizations")
  })

  it("leaves every tab to who acts on the platform", () => {
    expect(affiliateLinkTabFor("settings", true)).toBe("settings")
    expect(affiliateLinkTabFor("danger", true)).toBe("danger")
  })
})

describe("affiliateLinkTab", () => {
  it("keeps a tab the address names and falls back to the overview", () => {
    for (const tab of AFFILIATE_LINK_TABS) {
      expect(affiliateLinkTab(tab)).toBe(tab)
    }

    expect(affiliateLinkTab("billing")).toBe(AFFILIATE_LINK_TAB)
    expect(affiliateLinkTab(undefined)).toBe(AFFILIATE_LINK_TAB)
    expect(affiliateLinkTab(3)).toBe(AFFILIATE_LINK_TAB)
  })
})
