import {
  formatUsd,
  getPlan,
  TRIAL_DAYS,
  yearlyPriceUsd,
} from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import PricingNote from "./PricingNote.astro"

describe("PricingNote", () => {
  it("prints the shared prices and links to the pricing page", async () => {
    const html = await render(PricingNote, { path: "/" })
    const solo = getPlan("solo")

    expect(html).toContain(formatUsd(solo.monthlyPriceUsd))
    expect(html).toContain(formatUsd(yearlyPriceUsd(solo)))
    expect(html).toContain(`${TRIAL_DAYS}`)
    expect(html).toContain(formatUsd(getPlan("hosted").monthlyPriceUsd))
    expect(html).toContain("Team")
    expect(html).toContain('href="/pricing/"')
  })

  it("uses the French plan names under /fr", async () => {
    const html = await render(PricingNote, { path: "/fr/" })

    expect(html).toContain("Équipe")
    expect(html).toContain("Hébergé")
    expect(html).toContain('href="/fr/pricing/"')
  })
})
