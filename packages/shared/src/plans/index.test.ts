import { describe, expect, it } from "bun:test"
import {
  AFFILIATE_CLICK_WINDOW_DAYS,
  AFFILIATE_CODE_LENGTH,
  AFFILIATE_CODE_RE,
  AFFILIATE_COOKIE,
  AFFILIATE_COOKIE_DAYS,
  BILLING_INTERVALS,
  BILLING_MODES,
  BillingIntervalSchema,
  BillingModeSchema,
  FREE_SERVERS,
  GRANTED_PRODUCT,
  isLiveSubscriptionStatus,
  isPlatformProduct,
  MeLicenseGrantSchema,
  MeServersSchema,
  PLATFORM_ORGANIZATION_SEATS,
  PLATFORM_PRODUCTS,
  STRIPE_PRODUCT,
  SUBSCRIPTION_ACTIONS,
} from "./index"

describe("licences", () => {
  it("lets every organization run three servers for free", () => {
    expect(FREE_SERVERS).toBe(3)
    expect(PLATFORM_ORGANIZATION_SEATS).toBeGreaterThan(FREE_SERVERS)
  })

  it("keeps Stripe dormant behind the off mode", () => {
    expect(BILLING_MODES).toEqual(["stripe", "off"])
    expect(BillingModeSchema.safeParse("off").success).toBe(true)
    expect(BillingModeSchema.safeParse("launch").success).toBe(false)
    expect(BILLING_INTERVALS).toEqual(["month", "year"])
    expect(BillingIntervalSchema.safeParse("year").success).toBe(true)
    expect(BillingIntervalSchema.safeParse("week").success).toBe(false)
  })

  it("names the only product Stripe never sees: what the team grants", () => {
    expect(GRANTED_PRODUCT).toBe("granted")
    expect(PLATFORM_PRODUCTS).toEqual([GRANTED_PRODUCT])
    expect(isPlatformProduct("granted")).toBe(true)
    expect(isPlatformProduct("launch")).toBe(false)
    expect(isPlatformProduct("prod_server")).toBe(false)
    expect(STRIPE_PRODUCT).toBe("stripe")
  })

  it("lists the live statuses and the actions on a licence, without a trial to extend", () => {
    expect(isLiveSubscriptionStatus("active")).toBe(true)
    expect(isLiveSubscriptionStatus("past_due")).toBe(true)
    expect(isLiveSubscriptionStatus("canceled")).toBe(false)
    expect(SUBSCRIPTION_ACTIONS).toEqual([
      "resize",
      "resume",
      "cancel",
      "delete",
    ])
  })

  it("bounds an affiliate code, which only traces", () => {
    expect(AFFILIATE_CODE_RE.test("launch-2026")).toBe(true)
    expect(AFFILIATE_CODE_RE.test("Launch 2026")).toBe(false)
    expect(AFFILIATE_CODE_LENGTH).toBe(8)
    expect(AFFILIATE_COOKIE).toBe("pupitre_ref")
    expect(AFFILIATE_COOKIE_DAYS).toBe(90)
    expect(AFFILIATE_CLICK_WINDOW_DAYS).toBe(30)
  })
})

describe("the servers and licence as /me returns them", () => {
  it("counts an organization's servers against its limit", () => {
    expect(MeServersSchema.safeParse({ used: 2, limit: 3 }).success).toBe(true)
    expect(MeServersSchema.safeParse({ used: -1, limit: 3 }).success).toBe(
      false
    )
  })

  it("accepts what a licence adds, and nothing that names a plan", () => {
    const parsed = MeLicenseGrantSchema.safeParse({
      status: "active",
      seats: 10,
      current_period_end: "2026-12-25T00:00:00.000Z",
    })

    expect(parsed.success).toBe(true)
    expect(
      MeLicenseGrantSchema.safeParse({
        status: "",
        seats: -1,
        current_period_end: null,
      }).success
    ).toBe(false)
  })
})
