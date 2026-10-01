import { describe, expect, it } from "vitest"
import { homeContent, STACK } from "../content/site/home"
import { driftFor } from "../lib/drift"
import { LOCALES } from "../lib/i18n"
import { SOURCE_REPOSITORY_URL } from "../lib/urls"
import { render } from "../test/render"
import Hero from "./Hero.astro"

const paths = { en: "/", fr: "/fr/" } as const

describe("Hero", () => {
  it("says what it is in plain words, then offers the account", async () => {
    for (const locale of LOCALES) {
      const html = await render(Hero, { path: paths[locale] })
      const { hero } = homeContent(locale)

      expect(html, locale).toContain(
        `${hero.headline.slice(0, -hero.cooled.length - 2)}<span class="frost">${hero.cooled}</span>.</h1>`
      )
      expect(html, locale).toContain(hero.lead)
      expect(html, locale).toContain(hero.note)
      expect(html, locale).toContain(`>${hero.signUp}</a>`)
      expect(html, locale).toContain(`>${hero.download}</a>`)
    }
  })

  it("names every service of the wall, and shows a logo where one exists", async () => {
    const html = await render(Hero, { path: "/" })

    for (const item of STACK) {
      expect(html, item.name).toContain(`data-brand="${item.name}"`)
      expect(html, item.name).toContain(`>${item.name}</span>`)
    }
    expect(html.match(/<svg/g)).toHaveLength(
      STACK.filter((item) => item.module || item.mark).length +
        driftFor("hero").length +
        1
    )
  })

  it("opens on a free, source-available pill that leads to the repository", async () => {
    for (const locale of LOCALES) {
      const html = await render(Hero, { path: paths[locale] })

      expect(html, locale).toContain(
        `<a href="${SOURCE_REPOSITORY_URL}" class="pill`
      )
      expect(html, locale).toContain(homeContent(locale).hero.eyebrow)
    }
  })

  it("sets eight of those logos adrift in the margins, named and hidden from readers", async () => {
    const html = await render(Hero, { path: "/" })
    const drifts = driftFor("hero")

    expect(drifts).toHaveLength(8)
    for (const drift of drifts) {
      expect(html, drift.item.name).toContain(`data-drift="${drift.item.name}"`)
    }
    expect(html).toContain('aria-hidden="true" class="pointer-events-none')
  })

  it("shows no jargon a beginner would have to look up", async () => {
    for (const locale of LOCALES) {
      const html = await render(Hero, { path: paths[locale] })

      for (const word of ["VPS", "SSH", "ed25519", "ufw", "fail2ban", "tmux"]) {
        expect(html, `${locale} ${word}`).not.toContain(word)
      }
    }
  })
})
