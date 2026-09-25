import {
  formatUsd,
  PLANS,
  TRIAL_DAYS,
  yearlyPriceUsd,
} from "@pupitre/shared/plans"
import { afterEach, describe, expect, it } from "vitest"
import { pricingContent } from "../content/site/pricing"
import { fill } from "../lib/i18n"
import { LAUNCH_ENDS_AT, launchEndDate } from "../lib/launch"
import { SIGNUP_URL } from "../lib/urls"
import Fr from "../pages/fr/pricing.astro"
import En from "../pages/pricing.astro"
import {
  actions,
  offersDownloadAsMainAction,
  undeclaredButtons,
} from "./actions"
import { AFTER_LAUNCH, buildAt, buildNow, DURING_LAUNCH } from "./launch"
import { render } from "./render"
import { undeclaredVectors } from "./vectors"

const SECTION_IDS = ["plans", "stop", "diy", "catalog"]
const JSON_LD_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
const PAGES = [
  [En, "/pricing/", "en"],
  [Fr, "/fr/pricing/", "fr"],
] as const

interface Offer {
  "@type": string
  name: string
  price: string
  priceCurrency: string
  url: string
  availability: string
}

function structuredData(html: string): Record<string, unknown>[] {
  return [...html.matchAll(JSON_LD_RE)].map((match) => JSON.parse(match[1]))
}

describe("pricing page", () => {
  afterEach(buildNow)

  it("carries the headline and the three offers in both languages", async () => {
    for (const [page, path, locale] of PAGES) {
      const html = await render(page, { path })
      const content = pricingContent(locale)

      expect(html).toContain(`<html lang="${locale}"`)
      expect(html).toContain(`>${content.hero.headline}</h1>`)
      expect(html.match(/<article data-plan=/g)).toHaveLength(PLANS.length)
      expect(
        [...html.matchAll(/data-plan="(\w+)"/g)].map((match) => match[1])
      ).toEqual(PLANS.map((plan) => plan.id))
      for (const plan of PLANS) {
        const name = locale === "fr" ? plan.nameFr : plan.name

        expect(html, `${locale} ${plan.id}`).toContain(`>${name}</h3>`)
        expect(html).toContain(formatUsd(plan.monthlyPriceUsd))
      }
      for (const id of SECTION_IDS) {
        expect(html, `${locale} ${id}`).toContain(`<section id="${id}"`)
      }
    }
  })

  it("shows both intervals for the per-server plans and a native toggle", async () => {
    for (const [page, path] of PAGES) {
      const html = await render(page, { path })
      const perServer = PLANS.filter((plan) => plan.billedPer === "server")

      expect(html).toContain('id="billing-month"')
      expect(html).toContain('id="billing-year"')
      expect(html.match(/data-interval="month"/g)).toHaveLength(
        perServer.length
      )
      expect(html.match(/data-interval="year"/g)).toHaveLength(perServer.length)
      for (const plan of perServer) {
        expect(html).toContain(formatUsd(yearlyPriceUsd(plan)))
      }
      expect(html).toContain(`${TRIAL_DAYS}`)
    }
  })

  it("sends every offer to the sign-up, and keeps the download in reach", async () => {
    for (const [page, path, locale] of PAGES) {
      const html = await render(page, { path })
      const prefix = locale === "en" ? "" : "/fr"
      const available = PLANS.filter(
        (plan) => plan.availability === "available"
      )

      expect(
        html.match(new RegExp(`href="${SIGNUP_URL}"`, "g"))?.length
      ).toBeGreaterThanOrEqual(available.length + 1)
      expect(html.match(/href="https:\/\/app\.pupitre\.studio\/"/g)).toBeNull()
      expect(
        html.match(new RegExp(`href="${prefix}/download/"`, "g"))?.length
      ).toBeGreaterThanOrEqual(1)
      expect(offersDownloadAsMainAction(html), locale).toBe(false)
      expect(undeclaredButtons(html), locale).toEqual([])
      expect(html).toContain(`href="${prefix}/#catalog"`)
    }
  })

  it("turns the trial from a note into the promise of the button", async () => {
    buildAt(AFTER_LAUNCH)

    for (const [page, path, locale] of PAGES) {
      const html = await render(page, { path })
      const content = pricingContent(locale)

      expect(actions(html), locale).toContainEqual({
        href: SIGNUP_URL,
        label: fill(content.plans.trial, { days: TRIAL_DAYS }),
        main: true,
      })
      expect(html, locale).not.toContain("data-launch")
    }
  })

  it("announces the free launch above the plans while it runs, and starts for free", async () => {
    buildAt(DURING_LAUNCH)

    for (const [page, path, locale] of PAGES) {
      const html = await render(page, { path })
      const content = pricingContent(locale)
      const notice = fill(content.launch.notice, {
        date: launchEndDate(locale),
      })

      expect(html, locale).toContain(notice)
      expect(html.indexOf("data-launch"), locale).toBeLessThan(
        html.indexOf('id="plans"')
      )
      expect(actions(html), locale).toContainEqual({
        href: SIGNUP_URL,
        label: content.launch.cta,
        main: true,
      })
      expect(
        actions(html).some((action) => action.label.includes(`${TRIAL_DAYS}`)),
        locale
      ).toBe(false)
    }
  })

  it("marks Hosted as later, without a button", async () => {
    const html = await render(En, { path: "/pricing/" })
    const hosted = html.slice(html.indexOf('data-plan="hosted"'))
    const card = hosted.slice(0, hosted.indexOf("</article>"))

    expect(card).toContain('data-availability="later"')
    expect(card).not.toContain("<a ")
    expect(card).toContain(">Later<")
  })

  it("says the subscription stop honestly, without a deadline", async () => {
    for (const [page, path, locale] of PAGES) {
      const html = await render(page, { path })
      const content = pricingContent(locale)

      expect(html).toContain(`>${content.stop.title}</h2>`)
      expect(html).toContain(`>${content.stop.lead}</p>`)
      expect(html).toContain(`>${content.stop.keep.title}</h3>`)
      expect(html).toContain(`>${content.stop.lose.title}</h3>`)
      expect(html).toContain(`>${content.diy.replaces.title}</h3>`)
      expect(html).toContain(`>${content.diy.keeps.title}</h3>`)
    }
  })

  it("highlights the pricing link in the nav", async () => {
    for (const [page, path, locale] of PAGES) {
      const html = await render(page, { path })
      const prefix = locale === "en" ? "" : "/fr"

      expect(html).toContain(`<a href="${prefix}/pricing/" aria-current="page"`)
    }
  })

  it("stands without any image, and draws no undeclared vector", async () => {
    for (const [page, path] of PAGES) {
      const html = await render(page, { path })

      expect(html).not.toContain("<img")
      expect(html).not.toContain("<picture")
      expect(undeclaredVectors(html)).toEqual([])
    }
  })

  it("offers only the free launch in the head while it runs", async () => {
    buildAt(DURING_LAUNCH)

    for (const [page, path, locale] of PAGES) {
      const html = await render(page, { path })
      const data = structuredData(html.slice(0, html.indexOf("<body")))
      const offers = data[0].offers as (Offer & { priceValidUntil: string })[]

      expect(offers, locale).toHaveLength(1)
      expect(offers[0]).toMatchObject({
        name: pricingContent(locale).launch.offer,
        price: "0",
        priceValidUntil: LAUNCH_ENDS_AT.toISOString().slice(0, 10),
        availability: "https://schema.org/InStock",
      })
    }
  })

  it("puts a Product with one Offer per available plan and interval in the head", async () => {
    buildAt(AFTER_LAUNCH)

    for (const [page, path, locale] of PAGES) {
      const html = await render(page, { path })
      const head = html.slice(0, html.indexOf("<body"))
      const data = structuredData(head)
      const prefix = locale === "en" ? "" : "/fr"

      expect(data).toHaveLength(1)
      expect(data[0]["@context"]).toBe("https://schema.org")
      expect(data[0]["@type"]).toBe("Product")
      expect(data[0].name).toBe("Pupitre")
      expect(data[0].url).toBe(`https://pupitre.studio${prefix}/pricing/`)

      const offers = data[0].offers as Offer[]
      const available = PLANS.filter(
        (plan) => plan.availability === "available"
      )

      expect(offers).toHaveLength(available.length * 2)
      for (const plan of available) {
        const name = locale === "fr" ? plan.nameFr : plan.name
        const monthly = offers.find(
          (offer) =>
            offer.price === String(plan.monthlyPriceUsd) &&
            offer.name.startsWith(name)
        )
        const yearly = offers.find(
          (offer) =>
            offer.price === String(yearlyPriceUsd(plan)) &&
            offer.name.startsWith(name)
        )

        expect(monthly, `${locale} ${plan.id} monthly`).toBeDefined()
        expect(yearly, `${locale} ${plan.id} yearly`).toBeDefined()
      }
      for (const offer of offers) {
        expect(offer["@type"]).toBe("Offer")
        expect(offer.priceCurrency).toBe("USD")
        expect(offer.availability).toBe("https://schema.org/InStock")
        expect(offer.url).toBe("https://app.pupitre.studio/")
      }
      expect(JSON.stringify(data[0])).not.toContain("hosted")
    }
  })
})
