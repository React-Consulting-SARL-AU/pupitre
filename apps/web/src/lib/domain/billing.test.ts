import { describe, expect, it } from "bun:test"
import { formatUsd } from "@pupitre/shared/plans"
import {
  amountUsd,
  INTERVAL_KEYS,
  SEAT_PRICE_USD_PER_MONTH,
  seatBalance,
  subscriptionStatusLook,
  trialDaysLeft,
} from "@/lib/domain/billing"
import { translator } from "@/lib/i18n/i18n"

describe("amountUsd", () => {
  it("bills a monthly subscription per seat", () => {
    expect(SEAT_PRICE_USD_PER_MONTH).toBe(10)
    expect(amountUsd(3, "month")).toBe(30)
  })

  it("offers two months on the annual interval", () => {
    expect(amountUsd(1, "year")).toBe(100)
    expect(amountUsd(4, "year")).toBe(400)
  })

  it("falls back to the monthly price without an interval", () => {
    expect(amountUsd(2, null)).toBe(20)
  })
})

describe("formatUsd", () => {
  it("writes an amount in dollars", () => {
    expect(formatUsd(57)).toBe("$57")
  })
})

describe("seatBalance", () => {
  it("says nothing is wrong when seats and servers match", () => {
    expect(seatBalance(3, 3)).toEqual({
      paid: 3,
      used: 3,
      spare: 0,
      verdict: "matched",
    })
  })

  it("warns when the customer pays for seats no server uses", () => {
    expect(seatBalance(5, 2)).toEqual({
      paid: 5,
      used: 2,
      spare: 3,
      verdict: "unused",
    })
  })

  it("reports a quota reached when servers outnumber paid seats", () => {
    expect(seatBalance(1, 2).verdict).toBe("over_quota")
    expect(seatBalance(1, 2).spare).toBe(-1)
  })
})

describe("subscriptionStatusLook", () => {
  it("reads an active subscription as a filled dot", () => {
    expect(subscriptionStatusLook("active")).toEqual({
      shape: "filled",
      tone: "ok",
      label: "billing.status.active",
    })
  })

  it("reads a late payment as a warning", () => {
    expect(subscriptionStatusLook("past_due")?.tone).toBe("warn")
  })

  it("has no look for a status Stripe invented after us", () => {
    expect(subscriptionStatusLook("weird_new_status")).toBeNull()
  })
})

describe("INTERVAL_KEYS", () => {
  it("names both intervals in each language", () => {
    const fr = translator("fr")
    const en = translator("en")

    expect(fr(INTERVAL_KEYS.month)).toBe("Mensuel")
    expect(fr(INTERVAL_KEYS.year)).toBe("Annuel")
    expect(en(INTERVAL_KEYS.month)).toBe("Monthly")
    expect(en(INTERVAL_KEYS.year)).toBe("Yearly")
  })
})

describe("trialDaysLeft", () => {
  const now = new Date("2026-09-05T10:00:00.000Z")

  it("counts the days a running trial still has", () => {
    expect(trialDaysLeft("2026-09-19T10:00:00.000Z", now)).toBe(14)
    expect(trialDaysLeft("2026-09-06T09:00:00.000Z", now)).toBe(1)
  })

  it("counts a started day as a whole day", () => {
    expect(trialDaysLeft("2026-09-05T23:00:00.000Z", now)).toBe(1)
  })

  it("stops at zero once the trial is over", () => {
    expect(trialDaysLeft("2026-09-01T10:00:00.000Z", now)).toBe(0)
  })

  it("says nothing when Stripe gave no end date", () => {
    expect(trialDaysLeft(null, now)).toBeNull()
  })
})
