import { getPlan, yearlyPriceEur } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import PlanCard from "./PlanCard.astro"

describe("PlanCard", () => {
  it("prints Solo with both intervals, its server cap and an order button", async () => {
    const solo = getPlan("solo")
    const html = await render(PlanCard, { props: { plan: solo }, path: "/" })

    expect(html).toContain('<article data-plan="solo"')
    expect(html).toContain('data-availability="available"')
    expect(html).toContain(">Solo</h3>")
    expect(html).toContain('data-interval="month"')
    expect(html).toContain('data-interval="year"')
    expect(html).toContain(`${solo.monthlyPriceEur} €`)
    expect(html).toContain(`${yearlyPriceEur(solo)} €`)
    expect(html).toContain(`Up to ${solo.maxServers} servers`)
    expect(html).toContain(
      '<a href="https://app.pupitre.studio/" class="btn btn-primary">Order</a>'
    )
    expect(html).not.toContain(">From<")
  })

  it("prints Team without a server cap", async () => {
    const html = await render(PlanCard, {
      props: { plan: getPlan("team") },
      path: "/",
    })

    expect(html).toContain('<article data-plan="team"')
    expect(html).toContain(">Team</h3>")
    expect(html).not.toContain("Up to")
    expect(html).toContain("As many servers as you bring")
    expect(html).toContain('href="https://app.pupitre.studio/"')
  })

  it("marks Hosted as later, from a monthly price, without a button", async () => {
    const hosted = getPlan("hosted")
    const html = await render(PlanCard, { props: { plan: hosted }, path: "/" })

    expect(html).toContain('<article data-plan="hosted"')
    expect(html).toContain('data-availability="later"')
    expect(html).toContain(">Hosted</h3>")
    expect(html).toContain(">From<")
    expect(html).toContain(`${hosted.monthlyPriceEur} €`)
    expect(html).not.toContain(`${yearlyPriceEur(hosted)} €`)
    expect(html).not.toContain("data-interval")
    expect(html).not.toContain("<a ")
    expect(html).toContain(">Later<")
  })

  it("uses the French names and labels under /fr", async () => {
    const team = await render(PlanCard, {
      props: { plan: getPlan("team") },
      path: "/fr/pricing/",
    })
    const hosted = await render(PlanCard, {
      props: { plan: getPlan("hosted") },
      path: "/fr/pricing/",
    })

    expect(team).toContain(">Équipe</h3>")
    expect(team).toContain(">Commander</a>")
    expect(hosted).toContain(">Hébergé</h3>")
    expect(hosted).toContain(">À partir de<")
    expect(hosted).toContain(">Plus tard<")
  })
})
