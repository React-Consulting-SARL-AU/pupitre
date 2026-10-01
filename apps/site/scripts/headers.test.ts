import path from "node:path"
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import { describe, expect, it } from "vitest"
import {
  BEACON_REPORT_ORIGIN,
  BEACON_SCRIPT_ORIGIN,
} from "../src/lib/analytics"
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

  it("lets the Cloudflare beacon load and report, and nothing wider than the site itself", () => {
    const script = cspDirective(policy, "script-src")

    expect(script).toContain(BEACON_SCRIPT_ORIGIN)
    expect(connect).toContain("'self'")
    expect(connect).toContain(BEACON_REPORT_ORIGIN)
    expect(connect).not.toContain("*")
    expect(script).not.toContain("*")
  })

  it("names no PostHog host any more", () => {
    expect(policy).not.toContain("posthog")
  })
})
