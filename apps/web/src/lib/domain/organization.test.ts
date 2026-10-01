import { describe, expect, it } from "bun:test"
import { initialOf, organizationSlugFor, slugify } from "./organization"

const FALLBACK_SLUG_RE = /^org-[a-z0-9]+$/

describe("the organization", () => {
  it("derives a readable identifier from the name", () => {
    expect(slugify("Acme Inc.")).toBe("acme-inc")
    expect(slugify("Éditions Léon")).toBe("editions-leon")
    expect(slugify("  --Ops--  ")).toBe("ops")
  })

  it("always gives an identifier, even without a Latin letter", () => {
    expect(organizationSlugFor("Acme")).toBe("acme")
    expect(organizationSlugFor("株式会社")).toMatch(FALLBACK_SLUG_RE)
  })

  it("takes the first letter for the badge", () => {
    expect(initialOf("acme")).toBe("A")
    expect(initialOf(" ")).toBe("?")
  })
})
