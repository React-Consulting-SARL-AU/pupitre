import { describe, expect, it } from "vitest"
import { homeContent } from "../content/site/home"
import { LOCALES } from "../lib/i18n"
import { render } from "../test/render"
import Hero from "./Hero.astro"

const paths = { en: "/", fr: "/fr/" } as const

describe("Hero", () => {
  it("shows the report as text, with a shape per state", async () => {
    for (const locale of LOCALES) {
      const html = await render(Hero, { path: paths[locale] })
      const { hero } = homeContent(locale)

      expect(html, locale).toContain(hero.report.title)
      expect(html, locale).toContain(hero.report.caption)

      for (const line of hero.report.lines) {
        expect(html, `${locale} ${line.module}`).toContain(line.module)
        expect(html, `${locale} ${line.module}`).toContain(line.detail)
        expect(html, `${locale} ${line.module}`).toContain(
          `data-mark="${line.mark}"`
        )
      }
    }
  })

  it("stands on text alone, with no image and no icon", async () => {
    for (const locale of LOCALES) {
      const html = await render(Hero, { path: paths[locale] })

      expect(html, locale).not.toContain("<img")
      expect(html, locale).not.toContain("<svg")
      expect(html, locale).not.toContain("<picture")
    }
  })

  it("names the machine it needs before asking for a download", async () => {
    const html = await render(Hero, { path: "/" })
    const { hero } = homeContent("en")

    for (const spec of hero.specs) {
      expect(html).toContain(spec)
    }
  })
})
