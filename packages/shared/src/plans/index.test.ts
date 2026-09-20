import { describe, expect, it } from "bun:test"
import {
  AFFILIATE_CODE_LENGTH,
  AFFILIATE_CODE_RE,
  AFFILIATE_COOKIE,
  AFFILIATE_MAX_FREE_MONTHS,
  ANNUAL_FREE_MONTHS,
  BILLING_INTERVALS,
  BILLING_MODES,
  BillingIntervalSchema,
  BillingModeSchema,
  DAYS_PER_FREE_MONTH,
  formatUsd,
  GRANTED_PRODUCT,
  getPlan,
  isPlatformProduct,
  LAUNCH_ADMIN_SEATS,
  LAUNCH_PRODUCT,
  LAUNCH_SEATS,
  MeSubscriptionSchema,
  PLANS,
  PLATFORM_PRODUCTS,
  PlanIdSchema,
  PlanSchema,
  TRIAL_DAYS,
  TRIAL_REQUIRES_CARD,
  TRIAL_SEATS,
  TRIAL_WARN_DAYS,
  trialDaysLeft,
  yearlyPriceUsd,
} from "./index"

describe("plans", () => {
  it("lists Solo, Team and Hosted in that order", () => {
    expect(PLANS.map((plan) => plan.id)).toEqual(["solo", "team", "hosted"])
  })

  it("prices Solo and Team per server, Hosted from 29 per month", () => {
    expect(getPlan("solo").monthlyPriceUsd).toBe(5)
    expect(getPlan("team").monthlyPriceUsd).toBe(5)
    expect(getPlan("hosted").monthlyPriceUsd).toBe(29)
    expect(getPlan("hosted").billedPer).toBe("month")
    expect(getPlan("hosted").startingAt).toBe(true)
  })

  it("caps Solo at two servers and keeps Hosted for later", () => {
    expect(getPlan("solo").maxServers).toBe(2)
    expect(getPlan("team").maxServers).toBeNull()
    expect(getPlan("solo").availability).toBe("available")
    expect(getPlan("hosted").availability).toBe("later")
  })

  it("offers two months on the annual interval and a 30-day trial without card, on one machine", () => {
    expect(BILLING_INTERVALS).toEqual(["month", "year"])
    expect(ANNUAL_FREE_MONTHS).toBe(2)
    expect(yearlyPriceUsd(getPlan("solo"))).toBe(50)
    expect(TRIAL_DAYS).toBe(30)
    expect(TRIAL_REQUIRES_CARD).toBe(false)
    expect(TRIAL_SEATS).toBe(1)
  })

  it("names the launch mode, its product and its seats", () => {
    expect(BILLING_MODES).toEqual(["stripe", "launch"])
    expect(BillingModeSchema.safeParse("launch").success).toBe(true)
    expect(BillingModeSchema.safeParse("free").success).toBe(false)
    expect(LAUNCH_PRODUCT).toBe("launch")
    expect(LAUNCH_SEATS).toBe(TRIAL_SEATS)
    expect(LAUNCH_ADMIN_SEATS).toBeGreaterThan(LAUNCH_SEATS)
  })

  it("names the products Stripe never sees: the launch, and what the team grants", () => {
    expect(GRANTED_PRODUCT).toBe("granted")
    expect(PLATFORM_PRODUCTS).toEqual([LAUNCH_PRODUCT, GRANTED_PRODUCT])
    expect(isPlatformProduct("launch")).toBe(true)
    expect(isPlatformProduct("granted")).toBe(true)
    expect(isPlatformProduct("prod_server")).toBe(false)
  })

  it("bounds an affiliate code and its promise", () => {
    expect(AFFILIATE_CODE_RE.test("launch-2026")).toBe(true)
    expect(AFFILIATE_CODE_RE.test("Launch 2026")).toBe(false)
    expect(AFFILIATE_CODE_LENGTH).toBe(8)
    expect(AFFILIATE_COOKIE).toBe("pupitre_ref")
    expect(AFFILIATE_MAX_FREE_MONTHS).toBe(24)
    expect(DAYS_PER_FREE_MONTH).toBe(30)
  })

  it("validates ids, intervals and plans", () => {
    expect(PlanIdSchema.safeParse("team").success).toBe(true)
    expect(PlanIdSchema.safeParse("enterprise").success).toBe(false)
    expect(BillingIntervalSchema.safeParse("year").success).toBe(true)
    expect(BillingIntervalSchema.safeParse("week").success).toBe(false)
    for (const plan of PLANS) {
      expect(PlanSchema.safeParse(plan).success).toBe(true)
    }
    expect(
      PlanSchema.safeParse({ ...getPlan("solo"), monthlyPriceUsd: -1 }).success
    ).toBe(false)
  })

  it("throws on an unknown plan", () => {
    expect(() => getPlan("free" as never)).toThrow("Unknown plan: free")
  })
})

describe("formatUsd", () => {
  it("writes a whole amount in dollars", () => {
    expect(formatUsd(getPlan("solo").monthlyPriceUsd)).toBe("$5")
    expect(formatUsd(yearlyPriceUsd(getPlan("solo")))).toBe("$50")
  })
})

describe("l'abonnement tel que /me le rend", () => {
  it("accepte ce que le miroir Stripe porte, et rien qui nomme une offre", () => {
    const parsed = MeSubscriptionSchema.safeParse({
      status: "trialing",
      trial_ends_at: "2026-09-25T00:00:00.000Z",
      current_period_end: "2026-09-25T00:00:00.000Z",
      servers: { used: 1, limit: 2 },
    })

    expect(parsed.success).toBe(true)
    expect(
      MeSubscriptionSchema.safeParse({
        status: "",
        trial_ends_at: null,
        current_period_end: null,
        servers: { used: -1, limit: 0 },
      }).success
    ).toBe(false)
  })

  it("compte les jours d'essai restants, un jour entamé compris", () => {
    const now = new Date("2026-09-11T10:00:00.000Z")

    expect(trialDaysLeft("2026-09-16T09:00:00.000Z", now)).toBe(5)
    expect(trialDaysLeft("2026-09-13T12:00:00.000Z", now)).toBe(3)
    expect(trialDaysLeft("2026-09-01T00:00:00.000Z", now)).toBe(0)
    expect(trialDaysLeft(null, now)).toBeNull()
    expect(trialDaysLeft("pas une date", now)).toBeNull()
    expect(TRIAL_WARN_DAYS).toBe(3)
  })
})
