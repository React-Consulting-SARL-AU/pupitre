import { MODULE_IDS } from "@pupitre/shared/catalog"
import { describe, expect, it } from "vitest"
import { homeContent } from "../content/site/home"
import Fr from "../pages/fr/index.astro"
import En from "../pages/index.astro"
import { render } from "./render"

const SECTION_IDS = [
  "steps",
  "features",
  "clients",
  "catalog",
  "promise",
  "pricing",
  "faq",
]
const JSON_LD_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g

function structuredData(html: string): Record<string, unknown>[] {
  return [...html.matchAll(JSON_LD_RE)].map((match) => JSON.parse(match[1]))
}

describe("home", () => {
  it("carries the headline and two buttons in English", async () => {
    const html = await render(En, { path: "/" })

    expect(html).toContain(
      ">Your AI agents get a machine of their own. Your laptop cools down.</h1>"
    )
    expect(html).toContain(
      '<a href="/download/" class="btn btn-lg btn-primary">Download the app</a>'
    )
    expect(html).toContain(
      '<a href="https://app.pupitre.studio/" class="btn btn-lg btn-secondary">Order</a>'
    )
  })

  it("carries the headline and two buttons in French", async () => {
    const html = await render(Fr, { path: "/fr/" })

    expect(html).toContain('<html lang="fr"')
    expect(html).toContain(
      ">Vos agents IA travaillent sur une machine à eux. Votre laptop respire.</h1>"
    )
    expect(html).toContain(
      '<a href="/fr/download/" class="btn btn-lg btn-primary">Télécharger l’app</a>'
    )
    expect(html).toContain(
      '<a href="https://app.pupitre.studio/" class="btn btn-lg btn-secondary">Commander</a>'
    )
  })

  it("stands without any image", async () => {
    for (const [page, path] of [
      [En, "/"],
      [Fr, "/fr/"],
    ] as const) {
      const html = await render(page, { path })

      expect(html).not.toContain("<img")
      expect(html).not.toContain("<picture")
      expect(html).not.toContain("<svg")
    }
  })

  it("renders every section with its title in both languages", async () => {
    for (const [page, path, locale] of [
      [En, "/", "en"],
      [Fr, "/fr/", "fr"],
    ] as const) {
      const html = await render(page, { path })
      const content = homeContent(locale)

      for (const id of SECTION_IDS) {
        expect(html, `${locale} ${id}`).toContain(`<section id="${id}"`)
      }
      expect(html).toContain(`>${content.features.title}</h2>`)
      expect(html).toContain(`>${content.clients.title}</h2>`)
      expect(html).toContain(`>${content.catalog.title}</h2>`)
      expect(html).toContain(`>${content.promise.title}</h2>`)
      expect(html).toContain(`>${content.faq.title}</h2>`)
      expect(html).toContain(`>${content.pricing.title}</h2>`)
      for (const feature of content.features.items) {
        expect(html).toContain(`>${feature.title}</h3>`)
      }
      for (const claim of content.promise.items) {
        expect(html).toContain(`>${claim.statement}</h3>`)
      }
      expect(html.match(/<details/g)).toHaveLength(content.faq.items.length + 1)
      expect(html.match(/data-availability=/g)).toHaveLength(MODULE_IDS.length)
      expect(html).toContain(`href="${locale === "en" ? "" : "/fr"}/pricing/"`)
    }
  })

  it("puts SoftwareApplication and FAQPage JSON-LD in the head", async () => {
    for (const [page, path, locale] of [
      [En, "/", "en"],
      [Fr, "/fr/", "fr"],
    ] as const) {
      const html = await render(page, { path })
      const head = html.slice(0, html.indexOf("<body"))
      const data = structuredData(head)
      const content = homeContent(locale)

      expect(data.map((item) => item["@type"])).toEqual([
        "SoftwareApplication",
        "Organization",
        "FAQPage",
      ])
      expect(data[0].name).toBe("Pupitre")
      expect(data[0].inLanguage).toBe(locale)
      expect(data[2].mainEntity).toHaveLength(content.faq.items.length)
      expect(
        (data[2].mainEntity as Array<{ name: string }>).map((q) => q.name)
      ).toEqual(content.faq.items.map((item) => item.question))
    }
  })
})
