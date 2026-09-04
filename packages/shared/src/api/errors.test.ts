import { describe, expect, it } from "bun:test"
import { API_ERROR_CODES, ApiError } from "./errors"

describe("ApiError", () => {
  it("carries the status and the body", () => {
    const error = new ApiError(404, { code: "not_found" }, "Not found")

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("ApiError")
    expect(error.status).toBe(404)
    expect(error.body).toEqual({ code: "not_found" })
  })

  it("has no code yet", () => {
    expect(API_ERROR_CODES).toHaveLength(0)
  })
})
