import { describe, expect, it } from "vitest"
import { alternateLinks, canonicalUrl, ogSlug, ogUrl, SITE_URL } from "./seo"

describe("seo", () => {
  it("builds absolute canonical URLs on pupitre.studio", () => {
    expect(SITE_URL).toBe("https://pupitre.studio")
    expect(canonicalUrl("/")).toBe("https://pupitre.studio/")
    expect(canonicalUrl("/fr/pricing/")).toBe(
      "https://pupitre.studio/fr/pricing/"
    )
  })

  it("lists en, fr and x-default alternates for the same page", () => {
    expect(alternateLinks("/fr/pricing/")).toEqual([
      { hreflang: "en", href: "https://pupitre.studio/pricing/" },
      { hreflang: "fr", href: "https://pupitre.studio/fr/pricing/" },
      { hreflang: "x-default", href: "https://pupitre.studio/pricing/" },
    ])
  })

  it("names one Open Graph image per page", () => {
    expect(ogSlug("/")).toBe("index")
    expect(ogSlug("/fr/docs/start/vps/")).toBe("fr/docs/start/vps")
    expect(ogUrl("/pricing/")).toBe("https://pupitre.studio/og/pricing.png")
    expect(ogUrl("/")).toBe("https://pupitre.studio/og/index.png")
  })
})
