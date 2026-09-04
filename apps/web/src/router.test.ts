import { describe, expect, it } from "bun:test"
import { getRouter } from "./router"

describe("router", () => {
  it("registers the console index and both API mounts", () => {
    const ids = Object.keys(getRouter().routesById)

    expect(ids).toContain("/")
    expect(ids).toContain("/api/v1/$")
    expect(ids).toContain("/api/auth/$")
  })
})
