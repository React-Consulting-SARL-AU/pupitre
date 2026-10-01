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
  it("forbids everything by default, so a hostile message's scripts", () => {
    expect(directives(MAIL_HTML_CSP).get("default-src")).toBe("'none'")
  })

  it("reopens nothing for scripts or frames", () => {
    const policy = directives(MAIL_HTML_CSP)

    expect(policy.has("script-src")).toBe(false)
    expect(policy.has("script-src-elem")).toBe(false)
    expect(policy.has("child-src")).toBe(false)
    expect(policy.has("frame-src")).toBe(false)
  })

  it("keeps the frame on our own origin", () => {
    expect(directives(MAIL_HTML_CSP).get("frame-ancestors")).toBe("'self'")
  })

  it("isolates the body even when opened outside the console frame", () => {
    const policy = directives(MAIL_HTML_CSP)

    expect(policy.get("sandbox")).toBe("")
    expect(policy.get("form-action")).toBe("'none'")
    expect(policy.get("base-uri")).toBe("'none'")
  })

  it("loads no remote image, so a tracking pixel learns nothing", () => {
    expect(directives(MAIL_HTML_CSP).get("img-src")).toBe("data:")
    expect(directives(MAIL_HTML_CSP).get("font-src")).toBe("data:")
  })
})

describe("MAIL_NOSNIFF", () => {
  it("tells the browser not to guess the served type", () => {
    expect(MAIL_NOSNIFF).toBe("nosniff")
  })
})
