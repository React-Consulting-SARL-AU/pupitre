import { MODULE_CATEGORIES, MODULE_IDS } from "@pupitre/shared/catalog"
import { describe, expect, it } from "vitest"
import Integrations from "../components/Integrations.astro"
import { CATALOG } from "../content/site/catalog"
import { integrationsContent } from "../content/site/integrations"
import { moduleSlug } from "../lib/docs"
import { LOCALES } from "../lib/i18n"
import { actions, undeclaredButtons } from "./actions"
import { render } from "./render"

const paths = { en: "/integrations/", fr: "/fr/integrations/" } as const

describe("integrations", () => {
  it("lists every service of the contract with a link to its documentation, in both languages", async () => {
    for (const locale of LOCALES) {
      const html = await render(Integrations, { path: paths[locale] })
      const content = integrationsContent(locale)
      const prefix = locale === "en" ? "" : "/fr"

      expect(html, locale).toContain(`>${content.hero.headline}</h1>`)

      for (const id of MODULE_IDS) {
        expect(html, `${locale} ${id}`).toContain(`<li data-module="${id}"`)
        expect(html, `${locale} ${id}`).toContain(
          `href="${prefix}/docs/${moduleSlug(id)}/"`
        )
      }

      expect(html.match(/<li data-module=/g), locale).toHaveLength(
        MODULE_IDS.length
      )
      expect(
        html.match(new RegExp(`>${content.entry.documentation}</a>`, "g")),
        locale
      ).toHaveLength(MODULE_IDS.length)
    }
  })

  it("groups the services by the categories of the app, in the app's order", async () => {
    for (const locale of LOCALES) {
      const html = await render(Integrations, { path: paths[locale] })
      const positions = MODULE_CATEGORIES.map((category) =>
        html.indexOf(`data-category="${category}"`)
      )

      expect(
        positions.every((position) => position > -1),
        locale
      ).toBe(true)
      expect(positions, locale).toEqual([...positions].sort((a, b) => a - b))

      for (const group of CATALOG) {
        expect(html, `${locale} ${group.id}`).toContain(
          `>${group.label[locale]}</h2>`
        )
      }
    }
  })

  it("offers the app as the main action and declares every button", async () => {
    for (const locale of LOCALES) {
      const html = await render(Integrations, { path: paths[locale] })
      const content = integrationsContent(locale)
      const prefix = locale === "en" ? "" : "/fr"

      expect(actions(html), locale).toContainEqual({
        href: `${prefix}/download/`,
        label: content.hero.cta,
        main: true,
      })
      expect(undeclaredButtons(html), locale).toEqual([])
    }
  })

  it("points to the services page for what the catalogue does not hold", async () => {
    const html = await render(Integrations, { path: paths.en })
    const content = integrationsContent("en")

    expect(html).toContain(content.closing.body)
    expect(html).toContain('href="/docs/daily/services/"')
  })
})
