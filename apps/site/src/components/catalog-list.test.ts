import { MODULE_IDS, MVP_MODULE_IDS } from "@pupitre/shared/catalog"
import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import CatalogList from "./CatalogList.astro"

describe("CatalogList", () => {
  it("lists every module by category with its id as data", async () => {
    const html = await render(CatalogList, { path: "/" })

    expect(html.match(/<h3/g)).toHaveLength(7)
    expect(html.match(/<li/g)).toHaveLength(MODULE_IDS.length)
    for (const id of MODULE_IDS) {
      expect(html).toContain(`<code class="data text-ink-3">${id}</code>`)
    }
    expect(html).toContain(">Runtimes</h3>")
    expect(html).toContain("PostgreSQL 17")
  })

  it("marks availability by form and words", async () => {
    const html = await render(CatalogList, { path: "/" })

    expect(html.match(/data-availability="mvp"/g)).toHaveLength(
      MVP_MODULE_IDS.length
    )
    expect(html.match(/data-availability="later"/g)).toHaveLength(
      MODULE_IDS.length - MVP_MODULE_IDS.length
    )
    expect(html).toContain(">Later</span>")
    expect(html).toContain(">Required</span>")
  })

  it("speaks French under /fr", async () => {
    const html = await render(CatalogList, { path: "/fr/" })

    expect(html).toContain(">Bases de données</h3>")
    expect(html).toContain(">Bientôt</span>")
    expect(html).toContain(">Obligatoire</span>")
  })
})
