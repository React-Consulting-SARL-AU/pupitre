import { logoFor } from "@pupitre/design/logos"
import { MODULE_IDS, MVP_MODULE_IDS } from "@pupitre/shared/catalog"
import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import CatalogList from "./CatalogList.astro"

describe("CatalogList", () => {
  it("names every module by category, with its logo, and leaves the detail to the docs", async () => {
    const html = await render(CatalogList, { path: "/" })

    expect(html.match(/<h3/g)).toHaveLength(7)
    expect(html.match(/<li[\s>]/g)).toHaveLength(MODULE_IDS.length)
    expect(html.match(/<svg/g)).toHaveLength(
      MODULE_IDS.filter((id) => logoFor(id)).length
    )
    expect(html).not.toContain("fail2ban")
    expect(html).toContain(">Runtimes</h3>")
    expect(html).toContain(">PostgreSQL 17</p>")
  })

  it("marks availability by form and words", async () => {
    const html = await render(CatalogList, { path: "/" })

    expect(html.match(/data-availability="mvp"/g)).toHaveLength(
      MVP_MODULE_IDS.length
    )
    expect(html.match(/data-availability="later"/g)).toHaveLength(
      MODULE_IDS.length - MVP_MODULE_IDS.length
    )
    expect(html).toContain(">Soon</span>")
    expect(html).toContain(">Required</span>")
  })

  it("speaks French under /fr", async () => {
    const html = await render(CatalogList, { path: "/fr/" })

    expect(html).toContain(">Bases de données</h3>")
    expect(html).toContain(">Bientôt</span>")
    expect(html).toContain(">Obligatoire</span>")
  })
})
