import { describe, expect, it } from "bun:test"
import { MAIL_HTML_CSP, MAIL_NOSNIFF } from "./html"

const WHITESPACE_RE = /\s+/

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split(";").map((directive) => {
      const [name, ...values] = directive.trim().split(WHITESPACE_RE)

      return [name, values.join(" ")]
    })
  )
}

describe("MAIL_HTML_CSP", () => {
  it("interdit tout par défaut, donc les scripts d'un message hostile", () => {
    expect(directives(MAIL_HTML_CSP).get("default-src")).toBe("'none'")
  })

  it("ne rouvre rien pour les scripts ni les cadres", () => {
    const policy = directives(MAIL_HTML_CSP)

    expect(policy.has("script-src")).toBe(false)
    expect(policy.has("script-src-elem")).toBe(false)
    expect(policy.has("child-src")).toBe(false)
    expect(policy.has("frame-src")).toBe(false)
  })

  it("garde le cadre sur notre propre origine", () => {
    expect(directives(MAIL_HTML_CSP).get("frame-ancestors")).toBe("'self'")
  })

  it("ne charge aucune image distante, pour qu'un pixel de suivi n'apprenne rien", () => {
    expect(directives(MAIL_HTML_CSP).get("img-src")).toBe("data:")
    expect(directives(MAIL_HTML_CSP).get("font-src")).toBe("data:")
  })
})

describe("MAIL_NOSNIFF", () => {
  it("dit au navigateur de ne pas deviner le type servi", () => {
    expect(MAIL_NOSNIFF).toBe("nosniff")
  })
})
