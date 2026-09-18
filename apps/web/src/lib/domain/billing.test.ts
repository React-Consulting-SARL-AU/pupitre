import { describe, expect, it } from "bun:test"
import { formatUsd } from "@pupitre/shared/plans"
import {
  amountUsd,
  INTERVAL_KEYS,
  isLaunchSubscription,
  SEAT_PRICE_USD_PER_MONTH,
  seatBalance,
  seatsLocked,
  startOffer,
  subscriptionStatusLook,
  trialDaysLeft,
} from "@/lib/domain/billing"
import { translator } from "@/lib/i18n/i18n"

describe("amountUsd", () => {
  it("bills a monthly subscription per seat", () => {
    expect(SEAT_PRICE_USD_PER_MONTH).toBe(5)
    expect(amountUsd(3, "month")).toBe(15)
  })

  it("offers two months on the annual interval", () => {
    expect(amountUsd(1, "year")).toBe(50)
    expect(amountUsd(4, "year")).toBe(200)
  })

  it("falls back to the monthly price without an interval", () => {
    expect(amountUsd(2, null)).toBe(10)
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

  it("names the launch rather than a trial when the platform granted it", () => {
    expect(subscriptionStatusLook("trialing", "launch")).toEqual({
      shape: "filled",
      tone: "ok",
      label: "billing.status.launch",
    })
    expect(subscriptionStatusLook("trialing", "prod_server")?.label).toBe(
      "billing.status.trialing"
    )
    expect(subscriptionStatusLook("canceled", "launch")?.label).toBe(
      "billing.status.canceled"
    )
  })

  it("has no look for a status Stripe invented after us", () => {
    expect(subscriptionStatusLook("weird_new_status")).toBeNull()
  })
})

describe("isLaunchSubscription", () => {
  it("recognises the launch product whatever status it carries", () => {
    for (const status of ["trialing", "active", "canceled"]) {
      expect(isLaunchSubscription({ product: "launch", status }), status).toBe(
        true
      )
    }
  })

  it("leaves a Stripe subscription alone", () => {
    expect(
      isLaunchSubscription({ product: "prod_server", status: "trialing" })
    ).toBe(false)
    expect(isLaunchSubscription({ product: null, status: "trialing" })).toBe(
      false
    )
  })
})

describe("seatsLocked", () => {
  it("locks the seats of any trial, Stripe's or the launch's", () => {
    expect(seatsLocked({ product: "prod_server", status: "trialing" })).toBe(
      true
    )
    expect(seatsLocked({ product: "launch", status: "trialing" })).toBe(true)
    expect(seatsLocked({ product: "prod_server", status: "active" })).toBe(
      false
    )
  })

  it("locks a launch subscription the platform moved off the trial", () => {
    expect(seatsLocked({ product: "launch", status: "active" })).toBe(true)
  })
})

describe("startOffer", () => {
  it("offers the trial outside the launch, and before the status is known", () => {
    expect(startOffer({ mode: "stripe", launch_ends_at: null }).kind).toBe(
      "trial"
    )
    expect(startOffer(undefined).kind).toBe("trial")
    expect(startOffer(null).title).toBe("start.trialTitle")
  })

  it("offers the launch with its end date during the launch", () => {
    expect(
      startOffer({ mode: "launch", launch_ends_at: "2026-12-31T00:00:00.000Z" })
    ).toEqual({
      kind: "launch",
      endsAt: "2026-12-31T00:00:00.000Z",
      title: "start.launchTitle",
      action: "start.launchAction",
      actionPending: "start.launchActionPending",
      failed: "start.launchFailed",
    })
  })

  it("keeps a launch without a date open", () => {
    expect(
      startOffer({ mode: "launch", launch_ends_at: null }).endsAt
    ).toBeNull()
  })

  it("names each offer in both languages", () => {
    const fr = translator("fr")
    const en = translator("en")
    const launch = startOffer({ mode: "launch", launch_ends_at: null })

    expect(fr(launch.title)).toBe("Lancement gratuit")
    expect(en(launch.title)).toBe("Free launch")
    expect(fr(launch.action)).toBe("Commencer")
    expect(en(launch.action)).toBe("Start")
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
