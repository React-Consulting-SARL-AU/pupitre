import { describe, expect, it } from "bun:test"
import { getPlan, PLANS } from "./index"

describe("plans", () => {
  it("lists Solo, Team and Hosted in that order", () => {
    expect(PLANS.map((plan) => plan.id)).toEqual(["solo", "team", "hosted"])
  })

  it("prices Solo and Team per server, Hosted from 29 per month", () => {
    expect(getPlan("solo").monthlyPriceEur).toBe(19)
    expect(getPlan("team").monthlyPriceEur).toBe(19)
    expect(getPlan("hosted").monthlyPriceEur).toBe(29)
    expect(getPlan("hosted").billedPer).toBe("month")
    expect(getPlan("hosted").startingAt).toBe(true)
  })
})
