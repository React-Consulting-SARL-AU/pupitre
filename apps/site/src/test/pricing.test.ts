import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import { FREE_SERVERS } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import { pricingContent } from "../content/site/pricing"
import { fill } from "../lib/i18n"
import { SIGNUP_URL, SOURCE_REPOSITORY_URL } from "../lib/urls"
import Fr from "../pages/fr/pricing.astro"
import En from "../pages/pricing.astro"
import {
  actions,
  offersDownloadAsMainAction,
  undeclaredButtons,
} from "./actions"
import { render } from "./render"
import { undeclaredVectors } from "./vectors"

const SECTION_IDS = ["free", "beyond", "source", "stop", "diy", "catalog"]
const JSON_LD_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
const PRICE_RE = /\$\d|\d\s?(€|USD|EUR)|\bHT\b|excl\. tax/
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

function body(html: string): string {
  return html.slice(html.indexOf("<body"))
}

describe("pricing page", () => {
  it("says it is free up to the shared number of servers, in both languages", async () => {
    for (const [page, path, locale] of PAGES) {
      const html = await render(page, { path })
      const content = pricingContent(locale)

      expect(html).toContain(`<html lang="${locale}"`)
      expect(html).toContain(
        `>${fill(content.hero.headline, { count: FREE_SERVERS })}</h1>`
      )
      expect(html).toContain(content.hero.figure)
      expect(html, locale).not.toContain("{count}")
      for (const id of SECTION_IDS) {
        expect(html, `${locale} ${id}`).toContain(`<section id="${id}"`)
      }
    }
  })

  it("quotes no price, no billing interval, no trial and no launch", async () => {
    for (const [page, path, locale] of PAGES) {
      const html = body(await render(page, { path }))

      expect(html, locale).not.toMatch(PRICE_RE)
      expect(html, locale).not.toContain("billing-month")
      expect(html, locale).not.toContain("data-plan")
      expect(html, locale).not.toContain("data-launch")
    }
  })

  it("sends to the sign-up, keeps the download in reach, and asks for a licence by mail", async () => {
    for (const [page, path, locale] of PAGES) {
      const html = await render(page, { path })
      const content = pricingContent(locale)
      const prefix = locale === "en" ? "" : "/fr"

      expect(actions(html), locale).toContainEqual({
        href: SIGNUP_URL,
        label: content.free.signUp,
        main: true,
      })
      expect(actions(html), locale).toContainEqual({
        href: `mailto:${LEGAL_CONTACTS.support}`,
        label: content.beyond.contact,
        main: false,
      })
      expect(
        html.match(new RegExp(`href="${prefix}/download/"`, "g"))?.length
      ).toBeGreaterThanOrEqual(1)
      expect(offersDownloadAsMainAction(html), locale).toBe(false)
      expect(undeclaredButtons(html), locale).toEqual([])
      expect(html).toContain(`href="${prefix}/#catalog"`)
    }
  })

  it("names the licence of the source, and links to it and to the repository", async () => {
    for (const [page, path, locale] of PAGES) {
      const html = await render(page, { path })
      const { source } = pricingContent(locale)
      const prefix = locale === "en" ? "" : "/fr"

      expect(source.lead, locale).toContain("Apache 2.0")
      expect(source.lead, locale).toContain("Commons Clause")
      expect(html).toContain(`>${source.title}</h2>`)
      expect(html).toContain(`href="${prefix}/legal/licence/"`)
      expect(html).toContain(`href="${SOURCE_REPOSITORY_URL}"`)
    }
  })

  it("says what stays when Pupitre is removed, and what doing it yourself costs", async () => {
    for (const [page, path, locale] of PAGES) {
      const html = await render(page, { path })
      const content = pricingContent(locale)

      expect(html).toContain(`>${content.stop.title}</h2>`)
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

  it("puts a Product with one free Offer in the head", async () => {
    for (const [page, path, locale] of PAGES) {
      const html = await render(page, { path })
      const data = structuredData(html.slice(0, html.indexOf("<body")))
      const prefix = locale === "en" ? "" : "/fr"

      expect(data).toHaveLength(1)
      expect(data[0]["@type"]).toBe("Product")
      expect(data[0].name).toBe("Pupitre")
      expect(data[0].url).toBe(`https://pupitre.studio${prefix}/pricing/`)

      const offers = data[0].offers as Offer[]

      expect(offers, locale).toEqual([
        {
          "@type": "Offer",
          name: fill(pricingContent(locale).offer, { count: FREE_SERVERS }),
          price: "0",
          priceCurrency: "USD",
          url: "https://app.pupitre.studio/",
          availability: "https://schema.org/InStock",
        },
      ])
    }
  })
})
