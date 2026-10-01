import { afterEach, describe, expect, it, vi } from "vitest"
import Analytics from "../components/Analytics.astro"
import { render } from "../test/render"
import { analyticsToken, BEACON_SCRIPT_URL, beaconConfig } from "./analytics"

describe("analyticsToken", () => {
  it("measures nothing without a token", () => {
    expect(analyticsToken(undefined)).toBeNull()
    expect(analyticsToken("")).toBeNull()
    expect(analyticsToken("  ")).toBeNull()
    expect(analyticsToken(" abc123 ")).toBe("abc123")
  })
})

describe("beaconConfig", () => {
  it("hands the beacon its token as JSON", () => {
    expect(JSON.parse(beaconConfig("abc123"))).toEqual({ token: "abc123" })
  })
})

describe("Analytics", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("loads no script when the build carries no token", async () => {
    vi.stubEnv("PUBLIC_CF_WEB_ANALYTICS_TOKEN", "")

    const html = await render(Analytics, { path: "/" })

    expect(html).not.toContain("cloudflareinsights")
  })

  it("loads the Cloudflare beacon, deferred, when the build carries a token", async () => {
    vi.stubEnv("PUBLIC_CF_WEB_ANALYTICS_TOKEN", "abc123")

    const html = await render(Analytics, { path: "/" })

    expect(html).toContain(`src="${BEACON_SCRIPT_URL}"`)
    expect(html).toContain("defer")
    expect(html).toContain("data-cf-beacon")
    expect(html).toContain("abc123")
    expect(html).not.toContain("consent")
  })
})
