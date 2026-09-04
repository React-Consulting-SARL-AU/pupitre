import { describe, expect, it } from "bun:test"
import { getRouter } from "./router"
import { API_PREFIX } from "./worker"

describe("router", () => {
  it("registers the console routes and leaves /api/v1 to the worker", () => {
    const ids = Object.keys(getRouter().routesById)

    expect(ids).toContain("/auth/sign-in")
    expect(ids).toContain("/auth/device")
    expect(ids).toContain("/auth/invitation/$id")
    expect(ids).toContain("/dashboard")
    expect(ids).toContain("/dashboard/servers/")
    expect(ids).toContain("/dashboard/servers/$id")
    expect(ids).toContain("/dashboard/devices")
    expect(ids).toContain("/dashboard/billing")
    expect(ids).toContain("/dashboard/settings")
    expect(ids).toContain("/download")
    expect(ids).toContain("/api/auth/$")
    expect(ids).not.toContain("/api/v1/$")
    expect(API_PREFIX).toBe("/api/v1")
  })
})
