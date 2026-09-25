import { describe, expect, it } from "bun:test"
import { ApiError } from "@pupitre/api/client"
import { isUnauthenticated } from "./errors"

const REFUSED = { error: { code: "unauthenticated", message: "Sign in." } }

describe("isUnauthenticated", () => {
  it("recognises a session the API no longer knows", () => {
    expect(isUnauthenticated(new ApiError(401, REFUSED, "401"))).toBe(true)
  })

  it("leaves a platform failure or a network cut to a retry", () => {
    expect(isUnauthenticated(new ApiError(500, {}, "500"))).toBe(false)
    expect(isUnauthenticated(new TypeError("fetch failed"))).toBe(false)
  })
})
