import { logoFor } from "@pupitre/design/logos"
import { MANDATORY_MODULE_IDS, MODULE_IDS } from "@pupitre/shared/catalog"
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
    expect(html).toContain(">PostgreSQL</p>")
  })

  it("names every module of the contract, and flags the mandatory ones alone", async () => {
    const html = await render(CatalogList, { path: "/" })

    for (const id of MODULE_IDS) {
      expect(html, id).toContain(`<li data-module="${id}"`)
    }
    expect(html.match(/>Required<\/span>/g)).toHaveLength(
      MANDATORY_MODULE_IDS.length
    )
  })

  it("speaks French under /fr", async () => {
    const html = await render(CatalogList, { path: "/fr/" })

    expect(html).toContain(">Bases de données</h3>")
    expect(html).toContain(">Obligatoire</span>")
  })
})
