import { describe, expect, it } from "bun:test"
import { webAnalyticsBeaconConfig, webAnalyticsToken } from "./web-analytics"

describe("the Web Analytics configuration", () => {
  it("stays off while CF_WEB_ANALYTICS_TOKEN is absent or blank", () => {
    expect(webAnalyticsToken({})).toBeNull()
    expect(webAnalyticsToken({ CF_WEB_ANALYTICS_TOKEN: "  " })).toBeNull()
  })

  it("hands the beacon its token as Cloudflare reads it", () => {
    const token = webAnalyticsToken({ CF_WEB_ANALYTICS_TOKEN: " abc123 " })

    expect(token).toBe("abc123")
    expect(webAnalyticsBeaconConfig("abc123")).toBe('{"token":"abc123"}')
  })
})
