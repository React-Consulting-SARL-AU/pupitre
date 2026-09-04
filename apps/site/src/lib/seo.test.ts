import { describe, expect, it } from "vitest"
import { alternateLinks, canonicalUrl, SITE_URL } from "./seo"

describe("seo", () => {
  it("builds absolute canonical URLs on pupitre.sh", () => {
    expect(SITE_URL).toBe("https://pupitre.sh")
    expect(canonicalUrl("/")).toBe("https://pupitre.sh/")
    expect(canonicalUrl("/fr/pricing/")).toBe("https://pupitre.sh/fr/pricing/")
  })

  it("lists en, fr and x-default alternates for the same page", () => {
    expect(alternateLinks("/fr/pricing/")).toEqual([
      { hreflang: "en", href: "https://pupitre.sh/pricing/" },
      { hreflang: "fr", href: "https://pupitre.sh/fr/pricing/" },
      { hreflang: "x-default", href: "https://pupitre.sh/pricing/" },
    ])
  })
})
