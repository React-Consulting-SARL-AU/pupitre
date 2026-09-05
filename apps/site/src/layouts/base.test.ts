import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import Base from "./Base.astro"

const props = { title: "Pricing · Pupitre", description: "$19 per server." }

describe("Base layout", () => {
  it("renders a complete English head at the root", async () => {
    const html = await render(Base, {
      props,
      slots: { default: "<p>body</p>" },
      path: "/pricing/",
    })

    expect(html).toContain('<html lang="en"')
    expect(html).not.toContain("data-theme=")
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('name="viewport"')
    expect(html).toContain("<title>Pricing · Pupitre</title>")
    expect(html).toContain(
      '<meta name="description" content="$19 per server.">'
    )
    expect(html).toContain('<meta name="color-scheme" content="light dark">')
    expect(html).toContain(
      '<link rel="canonical" href="https://pupitre.studio/pricing/">'
    )
    expect(html).toContain(
      '<link rel="alternate" hreflang="en" href="https://pupitre.studio/pricing/">'
    )
    expect(html).toContain(
      '<link rel="alternate" hreflang="fr" href="https://pupitre.studio/fr/pricing/">'
    )
    expect(html).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://pupitre.studio/pricing/">'
    )
    expect(html).toContain(
      '<link rel="icon" href="/favicon.svg" type="image/svg+xml">'
    )
    expect(html).toContain(
      '<meta property="og:title" content="Pricing · Pupitre">'
    )
    expect(html).toContain(
      '<meta property="og:description" content="$19 per server.">'
    )
    expect(html).toContain('<meta property="og:type" content="website">')
    expect(html).toContain(
      '<meta property="og:url" content="https://pupitre.studio/pricing/">'
    )
    expect(html).toContain('<meta property="og:locale" content="en_US">')
    expect(html).toContain(
      '<meta property="og:locale:alternate" content="fr_FR">'
    )
    expect(html).toContain('<meta property="og:site_name" content="Pupitre">')
    expect(html).toContain("<p>body</p>")
  })

  it("switches to French under /fr", async () => {
    const html = await render(Base, { props, path: "/fr/pricing/" })

    expect(html).toContain('<html lang="fr"')
    expect(html).toContain(
      '<link rel="canonical" href="https://pupitre.studio/fr/pricing/">'
    )
    expect(html).toContain('<meta property="og:locale" content="fr_FR">')
    expect(html).toContain(
      '<meta property="og:locale:alternate" content="en_US">'
    )
    expect(html).toContain('href="/fr/docs/"')
    expect(html).toContain('href="/fr/pricing/"')
    expect(html).toContain('href="/fr/download/"')
    expect(html).toContain('href="/fr/blog/"')
  })

  it("boots the theme from the cookie before any stylesheet", async () => {
    const html = await render(Base, { props })
    const script = html.indexOf("pupitre_theme")
    const stylesheet = html.indexOf('rel="stylesheet"')

    expect(script).toBeGreaterThan(-1)
    expect(script).toBeLessThan(html.indexOf("<body"))
    expect(stylesheet === -1 || script < stylesheet).toBe(true)
  })

  it("loads Bricolage Grotesque and JetBrains Mono from Google Fonts with swap, without blocking the first paint", async () => {
    const html = await render(Base, { props })
    const fonts =
      "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&family=JetBrains+Mono:wght@400;500&display=swap"

    expect(html).toContain(
      '<link rel="preconnect" href="https://fonts.googleapis.com">'
    )
    expect(html).toContain(
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    )
    expect(html).toContain(
      `<link rel="stylesheet" href="${fonts}" media="print" onload="this.media='all'">`
    )
    expect(html).toContain(
      `<noscript><link rel="stylesheet" href="${fonts}"></noscript>`
    )
  })

  it("puts the head slot inside the head", async () => {
    const html = await render(Base, {
      props,
      slots: { head: '<meta name="x-test" content="1">' },
    })
    const meta = html.indexOf('name="x-test"')

    expect(meta).toBeGreaterThan(-1)
    expect(meta).toBeLessThan(html.indexOf("</head>"))
  })

  it("renders the nav, the theme and locale switches, and the footer", async () => {
    const html = await render(Base, { props, path: "/pricing/" })

    expect(html).toContain("<header")
    expect(html).toContain('<nav aria-label="Main"')
    expect(html).toContain(">Docs</a>")
    expect(html).toContain(">Pricing</a>")
    expect(html).toContain(">Download</a>")
    expect(html).toContain(">Blog</a>")
    expect(html).toContain('data-theme-option="system"')
    expect(html).toContain('href="/fr/pricing/" hreflang="fr" lang="fr"')
    expect(html).toContain('href="/download/"')
    expect(html).toContain(">Changelog</a>")
    expect(html).toContain("<footer")
    expect(html).toContain("</footer>")
    expect(html).toContain('href="/legal/terms/"')
    expect(html).toContain('href="/legal/privacy/"')
    expect(html).toContain("LLC")
    expect(html).toContain('<main id="main"')
  })
})
