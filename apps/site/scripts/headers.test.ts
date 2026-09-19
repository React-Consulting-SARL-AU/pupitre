import path from "node:path"
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import { describe, expect, it } from "vitest"
import { DEFAULT_POSTHOG_HOST } from "../src/lib/analytics"
import { contentSecurityPolicy, cspDirective, siteHeaders } from "./headers"

const ROOT = path.join(import.meta.dirname, "..")

describe("contentSecurityPolicy", () => {
  it("reads the policy off the header file and splits a directive", () => {
    const policy = contentSecurityPolicy(
      "/*\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; connect-src 'self' https://app.test\n"
    )

    expect(policy).toBe(
      "default-src 'self'; connect-src 'self' https://app.test"
    )
    expect(cspDirective(policy ?? "", "connect-src")).toEqual([
      "'self'",
      "https://app.test",
    ])
    expect(cspDirective(policy ?? "", "frame-src")).toEqual([])
  })

  it("has no policy to read when the file carries none", () => {
    expect(contentSecurityPolicy("/*\n  X-Frame-Options: DENY\n")).toBeNull()
  })
})

describe("the site's own headers", () => {
  const policy = contentSecurityPolicy(siteHeaders(ROOT)) ?? ""
  const connect = cspDirective(policy, "connect-src")

  it("lets the affiliate beacon reach the console", () => {
    expect(connect).toContain(PUPITRE_ORIGINS.app)
  })

  it("keeps the analytics host and nothing wider than the site itself", () => {
    expect(connect).toContain("'self'")
    expect(connect).toContain(DEFAULT_POSTHOG_HOST)
    expect(connect).not.toContain("*")
  })
})
