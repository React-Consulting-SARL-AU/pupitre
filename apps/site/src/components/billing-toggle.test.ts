import { ANNUAL_FREE_MONTHS } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import BillingToggle from "./BillingToggle.astro"

const INPUT_RE = /<input[^>]*>/g

describe("BillingToggle", () => {
  it("offers monthly and yearly as native radios, monthly checked by default", async () => {
    const html = await render(BillingToggle, { path: "/" })
    const inputs = [...html.matchAll(INPUT_RE)].map((m) => m[0])

    expect(html).toContain("<fieldset")
    expect(html).toContain("<legend")
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toContain('type="radio"')
    expect(inputs[0]).toContain('name="billing"')
    expect(inputs[0]).toContain('id="billing-month"')
    expect(inputs[0]).toContain('value="month"')
    expect(inputs[0]).toContain("checked")
    expect(inputs[1]).toContain('id="billing-year"')
    expect(inputs[1]).toContain('value="year"')
    expect(inputs[1]).not.toContain("checked")
    expect(html).toContain(">Monthly<")
    expect(html).toContain(">Yearly<")
    expect(html).toContain(`${ANNUAL_FREE_MONTHS} months free`)
  })

  it("needs no script", async () => {
    const html = await render(BillingToggle, { path: "/" })

    expect(html).not.toContain("<script")
  })

  it("speaks French under /fr", async () => {
    const html = await render(BillingToggle, { path: "/fr/pricing/" })

    expect(html).toContain(">Mensuel<")
    expect(html).toContain(">Annuel<")
    expect(html).toContain(`${ANNUAL_FREE_MONTHS} mois offerts`)
  })
})
