import { describe, expect, it } from "bun:test"
import { formatUsd } from "@pupitre/shared/plans"
import {
  amountUsd,
  INTERVAL_LABELS,
  SEAT_PRICE_USD_PER_MONTH,
  seatBalance,
  subscriptionStatusLook,
} from "@/lib/domain/billing"

describe("amountUsd", () => {
  it("bills a monthly subscription per seat", () => {
    expect(SEAT_PRICE_USD_PER_MONTH).toBe(19)
    expect(amountUsd(3, "month")).toBe(57)
  })

  it("offers two months on the annual interval", () => {
    expect(amountUsd(1, "year")).toBe(190)
    expect(amountUsd(4, "year")).toBe(760)
  })

  it("falls back to the monthly price without an interval", () => {
    expect(amountUsd(2, null)).toBe(38)
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
      label: "Actif",
    })
  })

  it("reads a late payment as a warning", () => {
    expect(subscriptionStatusLook("past_due").tone).toBe("warn")
  })

  it("keeps an unknown status readable", () => {
    expect(subscriptionStatusLook("weird_new_status").label).toBe(
      "weird_new_status"
    )
  })
})

describe("INTERVAL_LABELS", () => {
  it("names both intervals in French", () => {
    expect(INTERVAL_LABELS.month).toBe("Mensuel")
    expect(INTERVAL_LABELS.year).toBe("Annuel")
  })
})
