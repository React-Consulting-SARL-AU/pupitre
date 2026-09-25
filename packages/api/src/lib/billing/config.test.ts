import { describe, expect, it } from "bun:test"
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import { LAUNCH_ADMIN_SEATS } from "@pupitre/shared/plans"
import {
  AppUrlNotConfiguredError,
  appUrlFromEnv,
  BillingConfigInvalidError,
  BillingModeInvalidError,
  billingModeFromEnv,
  LaunchNotConfiguredError,
  stripeEventLeaseMsFromEnv,
  stripeSubscriptionUrl,
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

describe("appUrlFromEnv", () => {
  it("reads the console's origin, path and trailing slash apart", () => {
    expect(
      appUrlFromEnv({ VITE_APP_URL: "https://app.pupitre.studio/dashboard/" })
    ).toBe("https://app.pupitre.studio")
    expect(
      appUrlFromEnv({ BETTER_AUTH_URL: "https://app.pupitre.studio" })
    ).toBe("https://app.pupitre.studio")
  })

  it("falls back to the local console only on a machine without an environment", () => {
    expect(appUrlFromEnv({})).toBe(PUPITRE_ORIGINS.devConsole)
    expect(appUrlFromEnv({})).toBe("http://localhost:3000")
  })

  it("refuses to guess the console's address on a deployed platform", () => {
    expect(() =>
      appUrlFromEnv({ PUPITRE_ENVIRONMENT: "production", VITE_APP_URL: " " })
    ).toThrow(AppUrlNotConfiguredError)
  })
})

describe("stripeEventLeaseMsFromEnv", () => {
  it("holds an event five minutes unless told otherwise", () => {
    expect(stripeEventLeaseMsFromEnv({})).toBe(300_000)
    expect(stripeEventLeaseMsFromEnv({ STRIPE_EVENT_LEASE_MINUTES: "2" })).toBe(
      120_000
    )
  })

  it("refuses a lease that is not a positive number of minutes", () => {
    expect(() =>
      stripeEventLeaseMsFromEnv({ STRIPE_EVENT_LEASE_MINUTES: "0" })
    ).toThrow(BillingConfigInvalidError)
    expect(() =>
      stripeEventLeaseMsFromEnv({ STRIPE_EVENT_LEASE_MINUTES: "soon" })
    ).toThrow(BillingConfigInvalidError)
  })
})

describe("stripeSubscriptionUrl", () => {
  it("reads which dashboard holds the subscription off the configured key", () => {
    expect(
      stripeSubscriptionUrl("sub_1", { STRIPE_SECRET_KEY: "sk_live_x" })
    ).toBe("https://dashboard.stripe.com/subscriptions/sub_1")
    expect(
      stripeSubscriptionUrl("sub_1", { STRIPE_SECRET_KEY: "sk_test_x" })
    ).toBe("https://dashboard.stripe.com/test/subscriptions/sub_1")
  })

  it("takes the configured dashboard over the key, trailing slashes apart", () => {
    expect(
      stripeSubscriptionUrl("sub_1", {
        STRIPE_SECRET_KEY: "sk_test_x",
        STRIPE_DASHBOARD_URL: "https://dashboard.stripe.com/acct_42//",
      })
    ).toBe("https://dashboard.stripe.com/acct_42/subscriptions/sub_1")
  })

  it("falls back to the live dashboard without a key", () => {
    expect(stripeSubscriptionUrl("sub_1", {})).toBe(
      "https://dashboard.stripe.com/subscriptions/sub_1"
    )
  })
})
