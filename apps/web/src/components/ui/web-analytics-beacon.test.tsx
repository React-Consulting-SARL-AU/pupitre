import { afterEach, describe, expect, it, mock } from "bun:test"
import { render } from "@/testing/render"

let beacon: string | null = null

mock.module("@/lib/web-analytics-beacon", () => ({
  readWebAnalyticsBeacon: () => beacon,
}))
mock.module("@/lib/csp-nonce", () => ({ readCspNonce: () => "request-nonce" }))

const { WebAnalyticsBeacon } = await import(
  "@/components/ui/web-analytics-beacon"
)

const mounted: (() => void)[] = []

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount()
  }
})

describe("WebAnalyticsBeacon", () => {
  it("renders nothing without a token", async () => {
    beacon = null

    const { container, unmount } = await render(<WebAnalyticsBeacon />)

    mounted.push(unmount)

    expect(container.querySelector("script")).toBeNull()
  })

  it("loads Cloudflare's beacon with the request's nonce once a token is set", async () => {
    beacon = '{"token":"abc123"}'

    const { container, unmount } = await render(<WebAnalyticsBeacon />)

    mounted.push(unmount)

    const script = container.querySelector("script")

    expect(script?.getAttribute("src")).toBe(
      "https://static.cloudflareinsights.com/beacon.min.js"
    )
    expect(script?.getAttribute("data-cf-beacon")).toBe('{"token":"abc123"}')
    expect(script?.getAttribute("nonce")).toBe("request-nonce")
    expect(script?.hasAttribute("defer")).toBe(true)
  })
})
