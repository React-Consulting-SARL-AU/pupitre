import { describe, expect, it } from "bun:test"
import {
  ANNUAL_FREE_MONTHS,
  BILLING_INTERVALS,
  BillingIntervalSchema,
  formatUsd,
  getPlan,
  PLANS,
  PlanIdSchema,
  PlanSchema,
  TRIAL_DAYS,
  TRIAL_REQUIRES_CARD,
  yearlyPriceUsd,
} from "./index"

describe("plans", () => {
  it("lists Solo, Team and Hosted in that order", () => {
    expect(PLANS.map((plan) => plan.id)).toEqual(["solo", "team", "hosted"])
  })

  it("prices Solo and Team per server, Hosted from 29 per month", () => {
    expect(getPlan("solo").monthlyPriceUsd).toBe(19)
    expect(getPlan("team").monthlyPriceUsd).toBe(19)
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

  it("offers two months on the annual interval and a 14-day trial without card", () => {
    expect(BILLING_INTERVALS).toEqual(["month", "year"])
    expect(ANNUAL_FREE_MONTHS).toBe(2)
    expect(yearlyPriceUsd(getPlan("solo"))).toBe(190)
    expect(TRIAL_DAYS).toBe(14)
    expect(TRIAL_REQUIRES_CARD).toBe(false)
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
    expect(formatUsd(getPlan("solo").monthlyPriceUsd)).toBe("$19")
    expect(formatUsd(yearlyPriceUsd(getPlan("solo")))).toBe("$190")
  })
})
