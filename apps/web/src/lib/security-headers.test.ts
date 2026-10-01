import { describe, expect, it } from "bun:test"
import { createCspNonce, withSecurityHeaders } from "./security-headers"

const LOCAL = { PUPITRE_ENVIRONMENT: "local" } as const

const SIXTEEN_BYTES_IN_BASE64 = /^[A-Za-z0-9+/]{22}==$/

function directives(response: Response): Map<string, string> {
  const policy = response.headers.get("content-security-policy") ?? ""

  return new Map(
    policy.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ")

      return [name, sources.join(" ")]
    })
  )
}

describe("withSecurityHeaders", () => {
  it("lets a document run only the inline scripts that carry its nonce", () => {
    const nonce = createCspNonce()
    const policy = directives(
      withSecurityHeaders(new Response("<html></html>"), LOCAL, { nonce })
    )

    expect(policy.get("script-src")).toBe(`'self' 'nonce-${nonce}'`)
    expect(policy.get("script-src")).not.toContain("unsafe-inline")
  })

  it("names no font origin but its own", () => {
    const policy = directives(
      withSecurityHeaders(new Response(""), LOCAL, { nonce: createCspNonce() })
    )

    expect(policy.get("font-src")).toBe("'self'")
    expect(policy.get("style-src")).not.toContain("googleapis")
  })

  it("lets the inbox show an attachment from its presigned R2 address", () => {
    const policy = directives(
      withSecurityHeaders(new Response(""), LOCAL, { nonce: createCspNonce() })
    )

    expect(policy.get("img-src")).toContain(
      "https://*.r2.cloudflarestorage.com"
    )
    expect(policy.get("frame-src")).toBe(
      "'self' https://*.r2.cloudflarestorage.com"
    )
  })

  it("leaves the policy off what is not a document", () => {
    const response = withSecurityHeaders(new Response("{}"), LOCAL, {
      nonce: null,
    })

    expect(response.headers.get("content-security-policy")).toBeNull()
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  })

  it("names no analytics origin while no Web Analytics token is set", () => {
    const policy = directives(
      withSecurityHeaders(
        new Response(""),
        { ...LOCAL, CF_WEB_ANALYTICS_TOKEN: " " },
        { nonce: createCspNonce() }
      )
    )

    expect(policy.get("script-src")).not.toContain("cloudflareinsights")
    expect(policy.get("connect-src")).not.toContain("cloudflareinsights")
  })

  it("lets the Web Analytics beacon load and report once its token is set", () => {
    const nonce = createCspNonce()
    const policy = directives(
      withSecurityHeaders(
        new Response(""),
        { ...LOCAL, CF_WEB_ANALYTICS_TOKEN: "public-token" },
        { nonce }
      )
    )

    expect(policy.get("script-src")).toBe(
      `'self' 'nonce-${nonce}' https://static.cloudflareinsights.com`
    )
    expect(policy.get("connect-src")).toBe(
      "'self' https://*.r2.cloudflarestorage.com https://cloudflareinsights.com"
    )
  })

  it("draws a fresh nonce every time", () => {
    const first = createCspNonce()

    expect(first).toMatch(SIXTEEN_BYTES_IN_BASE64)
    expect(createCspNonce()).not.toBe(first)
  })
})
