import { describe, expect, it } from "vitest"
import { STACK } from "../content/site/home"
import { driftFor } from "./drift"

describe("drift", () => {
  it("shows the ten services of the wall once each, split between the two ends", () => {
    const names = [...driftFor("hero"), ...driftFor("cta")].map(
      (drift) => drift.item.name
    )

    expect(new Set(names).size).toBe(names.length)
    expect(names.toSorted()).toEqual(STACK.map((item) => item.name).toSorted())
  })

  it("keeps every logo clear of the column of text", () => {
    for (const place of ["hero", "cta"] as const) {
      for (const drift of driftFor(place)) {
        expect(drift.out, drift.item.name).toBeGreaterThanOrEqual(22)
        expect(drift.out, drift.item.name).toBeLessThanOrEqual(38)
        expect(drift.top, drift.item.name).toBeGreaterThanOrEqual(8)
        expect(drift.top, drift.item.name).toBeLessThanOrEqual(82)
      }
    }
  })

  it("balances the two sides", () => {
    for (const place of ["hero", "cta"] as const) {
      const drifts = driftFor(place)
      const start = drifts.filter((drift) => drift.side === "start")

      expect(start, place).toHaveLength(drifts.length / 2)
    }
  })
})
