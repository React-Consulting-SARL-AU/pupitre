import { describe, expect, it } from "bun:test"
import { personalOrganizationName, slugify } from "./personal-organization"

describe("personalOrganizationName", () => {
  it("takes the local part of the email", () => {
    expect(personalOrganizationName("ada.lovelace@test.local")).toBe(
      "ada.lovelace"
    )
    expect(personalOrganizationName("nobody")).toBe("nobody")
  })
})

describe("slugify", () => {
  it("produces a lowercase ascii kebab slug", () => {
    expect(slugify("Ada.Lovelace")).toBe("ada-lovelace")
    expect(slugify("jérôme_n+tag")).toBe("jerome-n-tag")
    expect(slugify("---")).toBe("")
  })
})
