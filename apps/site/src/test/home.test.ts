import { MODULE_IDS } from "@pupitre/shared/catalog"
import { TRIAL_DAYS } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import { homeContent, STACK } from "../content/site/home"
import { SIGNUP_URL } from "../lib/urls"
import Fr from "../pages/fr/index.astro"
import En from "../pages/index.astro"
import {
  actions,
  offersDownloadAsMainAction,
  undeclaredButtons,
} from "./actions"
import { render } from "./render"
import { undeclaredVectors } from "./vectors"

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
    expect(actions(html)).toContainEqual({
      href: SIGNUP_URL,
      label: "Create an account",
      main: true,
    })
    expect(actions(html)).toContainEqual({
      href: "/download/",
      label: "Download the app",
      main: false,
    })
  })

  it("carries the headline and two buttons in French", async () => {
    const html = await render(Fr, { path: "/fr/" })

    expect(html).toContain('<html lang="fr"')
    expect(html).toContain(
      ">Vos agents IA travaillent sur une machine à eux. Votre laptop respire.</h1>"
    )
    expect(actions(html)).toContainEqual({
      href: SIGNUP_URL,
      label: "Créer un compte",
      main: true,
    })
    expect(actions(html)).toContainEqual({
      href: "/fr/download/",
      label: "Télécharger l’app",
      main: false,
    })
  })

  it("never makes the download a main action", async () => {
    for (const [page, path] of [
      [En, "/"],
      [Fr, "/fr/"],
    ] as const) {
      const html = await render(page, { path })

      expect(offersDownloadAsMainAction(html), path).toBe(false)
      expect(undeclaredButtons(html), path).toEqual([])
    }
  })

  it("tells the six steps from the site to the installed server", async () => {
    for (const [page, path, locale] of [
      [En, "/", "en"],
      [Fr, "/fr/", "fr"],
    ] as const) {
      const html = await render(page, { path })
      const { steps } = homeContent(locale)

      expect(steps.items, locale).toHaveLength(6)
      expect(html).toContain('<p class="step-number">1</p>')
      expect(html).toContain('<p class="step-number">6</p>')
      expect(html, locale).not.toContain("{days}")
      expect(html, locale).toContain(`${TRIAL_DAYS}`)
      for (const item of steps.items) {
        expect(html, `${locale} ${item.title}`).toContain(`>${item.title}</h3>`)
      }
    }
  })

  it("closes on the account, and keeps the docs beside it", async () => {
    for (const [page, path, locale] of [
      [En, "/", "en"],
      [Fr, "/fr/", "fr"],
    ] as const) {
      const html = await render(page, { path })
      const { cta } = homeContent(locale)

      expect(actions(html), locale).toContainEqual({
        href: SIGNUP_URL,
        label: cta.signUp,
        main: true,
      })
      expect(html, locale).toContain(`>${cta.docs}</a>`)
    }
  })

  it("stands without a photograph, and draws no icon but a service logo", async () => {
    for (const [page, path] of [
      [En, "/"],
      [Fr, "/fr/"],
    ] as const) {
      const html = await render(page, { path })

      expect(html).not.toContain("<img")
      expect(html).not.toContain("<picture")
      expect(undeclaredVectors(html)).toEqual([])

      const named = html.match(/<svg[^>]*role="img"[^>]*><title>/g) ?? []

      expect(named.length).toBeGreaterThan(0)
    }
  })

  it("shows the wall of services the app installs", async () => {
    const html = await render(En, { path: "/" })

    for (const item of STACK) {
      expect(html, item.name).toContain(`data-brand="${item.name}"`)
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
      expect(html.match(/data-faq/g)).toHaveLength(content.faq.items.length)
      expect(html.match(/data-module=/g)).toHaveLength(MODULE_IDS.length)
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
