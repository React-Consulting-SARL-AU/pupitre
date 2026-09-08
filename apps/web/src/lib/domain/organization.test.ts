import { describe, expect, it } from "bun:test"
import {
  canManageOrganization,
  initialOf,
  organizationSlugFor,
  slugify,
} from "./organization"

const FALLBACK_SLUG_RE = /^org-[a-z0-9]+$/

describe("l'organisation", () => {
  it("ne laisse renommer que le propriétaire et l'administrateur", () => {
    expect(canManageOrganization("owner")).toBe(true)
    expect(canManageOrganization("admin")).toBe(true)
    expect(canManageOrganization("member")).toBe(false)
    expect(canManageOrganization(null)).toBe(false)
  })

  it("dérive un identifiant lisible du nom", () => {
    expect(slugify("Acme Inc.")).toBe("acme-inc")
    expect(slugify("Éditions Léon")).toBe("editions-leon")
    expect(slugify("  --Ops--  ")).toBe("ops")
  })

  it("donne toujours un identifiant, même sans lettre latine", () => {
    expect(organizationSlugFor("Acme")).toBe("acme")
    expect(organizationSlugFor("株式会社")).toMatch(FALLBACK_SLUG_RE)
  })

  it("prend la première lettre pour la pastille", () => {
    expect(initialOf("acme")).toBe("A")
    expect(initialOf(" ")).toBe("?")
  })
})
