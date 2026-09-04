import { MODULE_CATEGORIES } from "@pupitre/shared/catalog"
import { describe, expect, it } from "vitest"
import { CATALOG } from "../content/site/catalog"
import { render } from "../test/render"
import CatalogSummary from "./CatalogSummary.astro"

function count(group: (typeof CATALOG)[number], availability: string): number {
  return group.entries.filter((entry) => entry.availability === availability)
    .length
}

describe("CatalogSummary", () => {
  it("counts the available services of every category and links to the catalogue", async () => {
    const html = await render(CatalogSummary, { path: "/pricing/" })

    expect(html.match(/<li data-category=/g)).toHaveLength(
      MODULE_CATEGORIES.length
    )
    for (const group of CATALOG) {
      expect(html).toContain(`<li data-category="${group.id}"`)
      expect(html).toContain(`>${group.label.en}</h3>`)
      expect(html).toContain(`${count(group, "mvp")} available`)
      if (count(group, "later") > 0) {
        expect(html).toContain(`${count(group, "later")} soon`)
      }
      for (const entry of group.entries.filter(
        (e) => e.availability === "mvp"
      )) {
        expect(html).toContain(entry.name.en)
      }
    }
    expect(html).toContain('href="/#catalog"')
  })

  it("speaks French and links to the French home under /fr", async () => {
    const html = await render(CatalogSummary, { path: "/fr/pricing/" })

    expect(html).toContain(">Bases de données</h3>")
    expect(html).toContain("disponibles")
    expect(html).toContain('href="/fr/#catalog"')
  })
})
