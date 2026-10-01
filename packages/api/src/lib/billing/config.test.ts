import { describe, expect, it } from "bun:test"
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import {
  AppUrlNotConfiguredError,
  appUrlFromEnv,
  BillingConfigInvalidError,
  BillingModeInvalidError,
  billingModeFromEnv,
  stripeEventLeaseMsFromEnv,
  stripeSubscriptionUrl,
} from "./config"

describe("billingModeFromEnv", () => {
  it("stays off when nothing says otherwise", () => {
    expect(billingModeFromEnv({})).toBe("off")
    expect(billingModeFromEnv({ BILLING_MODE: "" })).toBe("off")
  })

  it("reads the mode it is given", () => {
    expect(billingModeFromEnv({ BILLING_MODE: "stripe" })).toBe("stripe")
    expect(billingModeFromEnv({ BILLING_MODE: "off" })).toBe("off")
  })

  it("refuses an unknown mode, the former launch included", () => {
    expect(() => billingModeFromEnv({ BILLING_MODE: "free" })).toThrow(
      BillingModeInvalidError
    )
    expect(() => billingModeFromEnv({ BILLING_MODE: "launch" })).toThrow(
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
