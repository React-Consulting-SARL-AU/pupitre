import { MODULE_CATEGORIES, MODULE_IDS } from "@pupitre/shared/catalog"
import { describe, expect, it } from "vitest"
import DocsIndex from "../components/DocsIndex.astro"
import DocsNav from "../components/DocsNav.astro"
import ServiceDoc from "../components/ServiceDoc.astro"
import ServicesIndex from "../components/ServicesIndex.astro"
import { CATALOG, CATALOG_ENTRIES } from "../content/site/catalog"
import { MODULE_LABELS } from "../content/site/docs"
import { MODULE_DOCS } from "../content/site/module-docs"
import { moduleSlug } from "../lib/docs"
import { docsSections } from "../lib/docs-entries"
import { LOCALES } from "../lib/i18n"
import { render } from "./render"

const paths = { en: "/docs/", fr: "/fr/docs/" } as const

describe("docs index", () => {
  it("lists the catalogue and localises every link", async () => {
    for (const locale of LOCALES) {
      const html = await render(DocsIndex, { path: paths[locale] })
      const prefix = locale === "en" ? "" : "/fr"

      expect(html, locale).toContain(`href="${prefix}/docs/services/"`)
      expect(html, locale).toContain(
        `href="${prefix}/docs/services/db-postgres/"`
      )
      expect(html, locale).toContain(MODULE_LABELS.overviewTitle[locale])
    }
  })

  it("splits the services into the categories of the app, in the app's order", async () => {
    for (const locale of LOCALES) {
      const html = await render(DocsIndex, { path: paths[locale] })
      const headings = CATALOG.map(
        (group) => `<h3 class="heading-4">${group.label[locale]}</h3>`
      )
      const positions = headings.map((heading) => html.indexOf(heading))

      expect(CATALOG.map((group) => group.id)).toEqual([...MODULE_CATEGORIES])
      expect(positions, locale).toEqual([...positions].sort((a, b) => a - b))
      expect(
        positions.every((position) => position > -1),
        locale
      ).toBe(true)
    }
  })
})

describe("docs nav", () => {
  it("lists the services under their category, in the app's order", async () => {
    for (const locale of LOCALES) {
      const sections = await docsSections(locale)
      const html = await render(DocsNav, {
        props: { sections, current: "", locale, id: "sidebar" },
        path: paths[locale],
      })
      const prefix = locale === "en" ? "" : "/fr"
      const positions = CATALOG.map((group) =>
        html.indexOf(`>${group.label[locale]}</p>`)
      )

      expect(
        positions.every((position) => position > -1),
        locale
      ).toBe(true)
      expect(positions, locale).toEqual([...positions].sort((a, b) => a - b))
      expect(html, locale).toContain(
        `href="${prefix}/docs/services/runtime-node/"`
      )
      expect(
        html.indexOf(`>${CATALOG[1].label[locale]}</p>`),
        locale
      ).toBeLessThan(
        html.indexOf(`href="${prefix}/docs/services/runtime-node/"`)
      )
    }
  })
})

describe("services index", () => {
  it("links every module of the catalogue to its own page", async () => {
    const html = await render(ServicesIndex, { path: "/docs/services/" })

    for (const id of MODULE_IDS) {
      expect(html, id).toContain(`href="/docs/${moduleSlug(id)}/"`)
    }
    expect(html.match(/<h2 id=/g)).toHaveLength(7)
  })
})

describe("a module page", () => {
  it("states what every module installs and asks for", async () => {
    for (const id of MODULE_IDS) {
      const html = await render(ServiceDoc, {
        props: { moduleId: id },
        path: `/docs/${moduleSlug(id)}/`,
      })
      const doc = MODULE_DOCS[id]
      const entry = CATALOG_ENTRIES.find((candidate) => candidate.id === id)

      expect(html, id).toContain(`>${entry?.name.en}</h1>`)
      expect(html, id).toContain(`>${id}</dd>`)
      expect(html, id).toContain(MODULE_LABELS.installs.en)

      for (const line of doc.installs) {
        expect(html, `${id} installs`).toContain(line.en)
      }
      for (const line of doc.asks) {
        expect(html, `${id} asks`).toContain(line.en)
      }
      if (doc.asks.length === 0) {
        expect(html, id).toContain(MODULE_LABELS.none.en)
      }
    }
  })

  it("speaks French under /fr", async () => {
    const html = await render(ServiceDoc, {
      props: { moduleId: "db.postgres" },
      path: "/fr/docs/services/db-postgres/",
    })

    expect(html).toContain(MODULE_LABELS.installs.fr)
    expect(html).toContain(MODULE_DOCS["db.postgres"].installs[0].fr)
    expect(html).toContain('href="/fr/docs/services/"')
  })

  it("carries a previous and a next link through the whole catalogue", async () => {
    const html = await render(ServiceDoc, {
      props: { moduleId: "db.postgres" },
      path: "/docs/services/db-postgres/",
    })

    expect(html).toContain("/docs/services/db-mysql/")
    expect(html).toContain("/docs/services/db-mongodb/")
  })
})
