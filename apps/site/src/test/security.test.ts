import { LEGAL_CONTACTS, LEGAL_ENTITY } from "@pupitre/shared/legal"
import { describe, expect, it } from "vitest"
import Security from "../components/Security.astro"
import { securityContent } from "../content/site/security"
import { LOCALES } from "../lib/i18n"
import { actions, undeclaredButtons } from "./actions"
import { render } from "./render"

const paths = { en: "/security/", fr: "/fr/security/" } as const

describe("security", () => {
  it("pairs every guarantee with the command that checks it, in both languages", async () => {
    for (const locale of LOCALES) {
      const html = await render(Security, { path: paths[locale] })
      const content = securityContent(locale)

      expect(html, locale).toContain(`>${content.hero.headline}</h1>`)
      expect(html.match(/<li data-guarantee/g), locale).toHaveLength(
        content.guarantees.items.length
      )

      for (const item of content.guarantees.items) {
        expect(html, `${locale} ${item.check}`).toContain(
          `<code class="data text-ink">${item.check}</code>`
        )
      }
    }
  })

  it("answers the same questions in both languages, each under a stable anchor", () => {
    const ids = (locale: (typeof LOCALES)[number]) =>
      securityContent(locale).questions.items.map((item) => item.id)

    expect(ids("fr")).toEqual(ids("en"))
    expect(ids("en")).toEqual(
      expect.arrayContaining(["source", "shutdown", "removal", "builder"])
    )
  })

  it("names who builds Pupitre from the legal record, in both languages", async () => {
    for (const locale of LOCALES) {
      const html = await render(Security, { path: paths[locale] })

      expect(html, locale).toContain(LEGAL_ENTITY.owner)
      expect(html, locale).not.toContain("{owner}")
    }
  })

  it("gives the removal command and the page that details it", async () => {
    for (const locale of LOCALES) {
      const html = await render(Security, { path: paths[locale] })
      const prefix = locale === "en" ? "" : "/fr"

      expect(html, locale).toContain("<code>sudo pupitred uninstall</code>")
      expect(html, locale).toContain(`href="${prefix}/docs/account/uninstall/"`)
    }
  })

  it("points to the security docs as the main action and to the disclosure address", async () => {
    for (const locale of LOCALES) {
      const html = await render(Security, { path: paths[locale] })
      const content = securityContent(locale)
      const prefix = locale === "en" ? "" : "/fr"

      expect(actions(html), locale).toContainEqual({
        href: `${prefix}/docs/account/security/`,
        label: content.hero.cta,
        main: true,
      })
      expect(html, locale).toContain(`href="mailto:${LEGAL_CONTACTS.security}"`)
      expect(html, locale).toContain(`href="${prefix}/legal/security/"`)
      expect(undeclaredButtons(html), locale).toEqual([])
    }
  })
})
