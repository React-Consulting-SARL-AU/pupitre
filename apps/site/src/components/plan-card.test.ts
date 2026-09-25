import { formatUsd, getPlan, yearlyPriceUsd } from "@pupitre/shared/plans"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SIGNUP_URL } from "../lib/urls"
import { actionTo } from "../test/actions"
import { AFTER_LAUNCH, buildAt, buildNow, DURING_LAUNCH } from "../test/launch"
import { render } from "../test/render"
import PlanCard from "./PlanCard.astro"

describe("PlanCard during the launch", () => {
  beforeEach(() => buildAt(DURING_LAUNCH))
  afterEach(buildNow)

  it("starts for free rather than a trial", async () => {
    const solo = await render(PlanCard, {
      props: { plan: getPlan("solo") },
      path: "/",
    })
    const team = await render(PlanCard, {
      props: { plan: getPlan("team") },
      path: "/fr/pricing/",
    })

    expect(actionTo(solo, SIGNUP_URL)?.label).toBe("Start for free")
    expect(team).toContain(">Commencer gratuitement</a>")
  })
})

describe("PlanCard", () => {
  beforeEach(() => buildAt(AFTER_LAUNCH))
  afterEach(buildNow)

  it("prints Solo with both intervals, its server cap and a trial button", async () => {
    const solo = getPlan("solo")
    const html = await render(PlanCard, { props: { plan: solo }, path: "/" })

    expect(html).toContain('<article data-plan="solo"')
    expect(html).toContain('data-availability="available"')
    expect(html).toContain(">Solo</h3>")
    expect(html).toContain('data-interval="month"')
    expect(html).toContain('data-interval="year"')
    expect(html).toContain(formatUsd(solo.monthlyPriceUsd))
    expect(html).toContain(formatUsd(yearlyPriceUsd(solo)))
    expect(html).toContain(`Up to ${solo.maxServers} servers`)
    expect(actionTo(html, SIGNUP_URL)).toEqual({
      href: SIGNUP_URL,
      label: "Start the trial",
      main: true,
    })
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
    expect(html).toContain(`href="${SIGNUP_URL}"`)
  })

  it("marks Hosted as later, from a monthly price, without a button", async () => {
    const hosted = getPlan("hosted")
    const html = await render(PlanCard, { props: { plan: hosted }, path: "/" })

    expect(html).toContain('<article data-plan="hosted"')
    expect(html).toContain('data-availability="later"')
    expect(html).toContain(">Hosted</h3>")
    expect(html).toContain(">From<")
    expect(html).toContain(formatUsd(hosted.monthlyPriceUsd))
    expect(html).not.toContain(formatUsd(yearlyPriceUsd(hosted)))
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
    expect(team).toContain(">Démarrer l’essai</a>")
    expect(hosted).toContain(">Hébergé</h3>")
    expect(hosted).toContain(">À partir de<")
    expect(hosted).toContain(">Plus tard<")
  })
})
