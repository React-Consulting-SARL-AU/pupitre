import { getPlan, TRIAL_DAYS, yearlyPriceEur } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import PricingNote from "./PricingNote.astro"

describe("PricingNote", () => {
  it("prints the shared prices and links to the pricing page", async () => {
    const html = await render(PricingNote, { path: "/" })
    const solo = getPlan("solo")

    expect(html).toContain(`${solo.monthlyPriceEur} €`)
    expect(html).toContain(`${yearlyPriceEur(solo)} €`)
    expect(html).toContain(`${TRIAL_DAYS}`)
    expect(html).toContain(`${getPlan("hosted").monthlyPriceEur} €`)
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
