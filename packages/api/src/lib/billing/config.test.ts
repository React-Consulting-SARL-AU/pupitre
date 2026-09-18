import { describe, expect, it } from "bun:test"
import { LAUNCH_ADMIN_SEATS } from "@pupitre/shared/plans"
import {
  BillingModeInvalidError,
  billingModeFromEnv,
  LaunchNotConfiguredError,
} from "./config"

describe("billingModeFromEnv", () => {
  it("defaults to Stripe with the shared admin seats", () => {
    expect(billingModeFromEnv({})).toEqual({
      mode: "stripe",
      launchEndsAt: null,
      adminSeats: LAUNCH_ADMIN_SEATS,
    })
  })

  it("reads the launch end and the admin seats", () => {
    expect(
      billingModeFromEnv({
        BILLING_MODE: "launch",
        LAUNCH_ENDS_AT: "2026-12-31T23:59:59Z",
        LAUNCH_ADMIN_SEATS: "12",
      })
    ).toEqual({
      mode: "launch",
      launchEndsAt: new Date("2026-12-31T23:59:59.000Z"),
      adminSeats: 12,
    })
  })

  it("refuses to start a launch without an end date", () => {
    expect(() => billingModeFromEnv({ BILLING_MODE: "launch" })).toThrow(
      LaunchNotConfiguredError
    )
    expect(() =>
      billingModeFromEnv({ BILLING_MODE: "launch", LAUNCH_ENDS_AT: "soon" })
    ).toThrow(LaunchNotConfiguredError)
    expect(() =>
      billingModeFromEnv({
        BILLING_MODE: "launch",
        LAUNCH_ENDS_AT: "2026-12-31T23:59:59Z",
        LAUNCH_ADMIN_SEATS: "0",
      })
    ).toThrow(LaunchNotConfiguredError)
  })

  it("refuses an unknown mode", () => {
    expect(() => billingModeFromEnv({ BILLING_MODE: "free" })).toThrow(
      BillingModeInvalidError
    )
  })
})
