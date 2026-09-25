import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import { describe, expect, it } from "vitest"
import { SECURITY_TXT_VALID_DAYS, securityTxt } from "./security-txt"

function field(text: string, name: string): string[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith(`${name}: `))
    .map((line) => line.slice(name.length + 2))
}

describe("security.txt", () => {
  const now = new Date("2026-09-24T12:00:00.000Z")
  const text = securityTxt(now)

  it("gives the security address the shared contract declares", () => {
    expect(field(text, "Contact")).toEqual([
      `mailto:${LEGAL_CONTACTS.security}`,
    ])
  })

  it("expires within a year of the build, as RFC 9116 asks", () => {
    const [expires] = field(text, "Expires")
    const days = (Date.parse(expires) - now.getTime()) / 86_400_000

    expect(days).toBe(SECURITY_TXT_VALID_DAYS)
    expect(days).toBeLessThan(365)
  })

  it("points to the security policy in both languages", () => {
    expect(field(text, "Policy")).toEqual([
      "https://pupitre.studio/legal/security/",
      "https://pupitre.studio/fr/legal/security/",
    ])
    expect(field(text, "Preferred-Languages")).toEqual(["en, fr"])
    expect(field(text, "Canonical")).toEqual([
      "https://pupitre.studio/.well-known/security.txt",
    ])
  })
})
