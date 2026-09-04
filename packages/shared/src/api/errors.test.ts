import { describe, expect, it } from "bun:test"
import {
  API_ERROR_CODES,
  ApiError,
  ApiErrorBodySchema,
  ApiErrorCodeSchema,
  isApiErrorBody,
} from "./errors"

describe("ApiError", () => {
  it("carries the status and the body", () => {
    const error = new ApiError(404, { code: "not_found" }, "Not found")

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("ApiError")
    expect(error.status).toBe(404)
    expect(error.body).toEqual({ code: "not_found" })
  })
})

describe("API_ERROR_CODES", () => {
  it("names the codes of the platform API", () => {
    for (const code of [
      "unauthenticated",
      "forbidden",
      "not_found",
      "validation",
      "enrollment_used",
      "seat_quota_reached",
      "key_not_ed25519",
      "entitlement_required",
      "stripe_signature_invalid",
    ]) {
      expect(API_ERROR_CODES as readonly string[]).toContain(code)
    }
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length)
    expect(ApiErrorCodeSchema.safeParse("teapot").success).toBe(false)
  })
})

describe("ApiErrorBodySchema", () => {
  it("accepts the single error shape with an optional fix", () => {
    expect(
      ApiErrorBodySchema.safeParse({
        error: { code: "seat_quota_reached", message: "No seat left" },
      }).success
    ).toBe(true)
    expect(
      ApiErrorBodySchema.safeParse({
        error: {
          code: "key_not_ed25519",
          message: "Only ed25519 keys are accepted",
          fix: "ssh-keygen -t ed25519",
        },
      }).success
    ).toBe(true)
  })

  it("rejects a flat error and an unknown code", () => {
    expect(
      ApiErrorBodySchema.safeParse({ code: "not_found", message: "…" }).success
    ).toBe(false)
    expect(
      ApiErrorBodySchema.safeParse({ error: { code: "oops", message: "…" } })
        .success
    ).toBe(false)
    expect(isApiErrorBody({ error: { code: "forbidden", message: "" } })).toBe(
      true
    )
    expect(isApiErrorBody(null)).toBe(false)
  })
})
