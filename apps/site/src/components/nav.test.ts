import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import Footer from "./Footer.astro"
import Nav from "./Nav.astro"

describe("Nav", () => {
  it("marks the section the reader is in", async () => {
    const html = await render(Nav, { path: "/docs/start/vps/" })

    expect(html).toContain('href="/docs/" aria-current="page"')
    expect(html).not.toContain('href="/blog/" aria-current="page"')
  })

  it("keeps every link inside the language the reader chose", async () => {
    const html = await render(Nav, { path: "/fr/pricing/" })

    for (const href of [
      "/fr/docs/",
      "/fr/pricing/",
      "/fr/blog/",
      "/fr/download/",
    ]) {
      expect(html, href).toContain(`href="${href}"`)
    }
    expect(html).toContain('href="/pricing/" hreflang="en"')
  })

  it("offers the same links behind a menu on a narrow screen", async () => {
    const html = await render(Nav, { path: "/" })

    expect(html).toContain("data-nav-menu")
    expect(html.match(/href="\/download\/"/g)?.length).toBe(2)
  })
})

describe("Footer", () => {
  it("groups product, resources and legal, and points at the status page", async () => {
    const html = await render(Footer, { path: "/" })

    expect(html).toContain('aria-label="Product"')
    expect(html).toContain('aria-label="Resources"')
    expect(html).toContain('aria-label="Legal"')
    expect(html).toContain('href="https://app.pupitre.studio/status/"')
    expect(html).toContain('href="/legal/data-processing/"')
    expect(html).toContain("Pupitre LLC")
  })

  it("localises every internal link under /fr", async () => {
    const html = await render(Footer, { path: "/fr/" })

    expect(html).toContain('href="/fr/legal/terms/"')
    expect(html).toContain('href="/fr/docs/"')
    expect(html).toContain("Traitement des données")
  })
})
