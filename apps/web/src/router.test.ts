import { describe, expect, it, mock } from "bun:test"
import { API_PREFIX } from "./lib/config/urls"

const REQUEST_NONCE = "bm9uY2Utb2YtdGhlLXJlcXVlc3Q="

mock.module("@/lib/csp-nonce", () => ({ readCspNonce: () => REQUEST_NONCE }))

const { getRouter } = await import("./router")

describe("router", () => {
  it("hands the nonce of the request to every script it streams", () => {
    expect(getRouter().options.ssr?.nonce).toBe(REQUEST_NONCE)
  })

  it("registers the console routes and leaves /api/v1 to the worker", () => {
    const ids = Object.keys(getRouter().routesById)

    expect(ids).toContain("/auth/sign-in")
    expect(ids).toContain("/auth/device")
    expect(ids).toContain("/auth/invitation/$id")
    expect(ids).toContain("/dashboard")
    expect(ids).toContain("/dashboard/start")
    expect(ids).toContain("/dashboard/servers/")
    expect(ids).toContain("/dashboard/servers/$id")
    expect(ids).toContain("/dashboard/devices")
    expect(ids).toContain("/dashboard/billing")
    expect(ids).toContain("/dashboard/settings")
    expect(ids).toContain("/download")
    expect(ids).toContain("/status")
    expect(ids).toContain("/api/auth/$")
    expect(ids).not.toContain("/api/v1/$")
    expect(API_PREFIX).toBe("/api/v1")
  })

  it("only says it is loading when the wait is real, and long enough to be read", () => {
    const { defaultPendingMs, defaultPendingMinMs } = getRouter().options

    expect(defaultPendingMs).toBe(150)
    expect(defaultPendingMinMs).toBe(300)
  })
})
