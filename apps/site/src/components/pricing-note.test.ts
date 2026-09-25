import {
  formatUsd,
  getPlan,
  TRIAL_DAYS,
  yearlyPriceUsd,
} from "@pupitre/shared/plans"
import { describe, expect, it, vi } from "vitest"
import { LAUNCH_ENDS_AT, launchEndDate } from "../lib/launch"
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

  it("announces the free launch and its last day while it runs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(LAUNCH_ENDS_AT.getTime() - 1000))

    const html = await render(PricingNote, { path: "/fr/" })

    vi.useRealTimers()
    expect(html).toContain("data-launch")
    expect(html).toContain(`jusqu’au ${launchEndDate("fr")}`)
  })

  it("stops announcing the launch once it has ended", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(LAUNCH_ENDS_AT)

    const html = await render(PricingNote, { path: "/" })

    vi.useRealTimers()
    expect(html).not.toContain("data-launch")
  })

  it("uses the French plan names under /fr", async () => {
    const html = await render(PricingNote, { path: "/fr/" })

    expect(html).toContain("Équipe")
    expect(html).toContain("Hébergé")
    expect(html).toContain('href="/fr/pricing/"')
  })
})
