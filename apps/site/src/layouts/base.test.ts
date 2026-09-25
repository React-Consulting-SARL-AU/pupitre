import { readFileSync } from "node:fs"
import { COMPACT, MARK } from "@pupitre/design/brand"
import { copyrightHolder } from "@pupitre/shared/legal"
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

  // Byte equality would only measure the formatter; the drawing is what must not drift.
  it("serves the brand mark itself as the favicon", () => {
    const favicon = readFileSync(
      new URL("../../public/favicon.svg", import.meta.url),
      "utf8"
    )

    expect(favicon).toContain(`d="${MARK.chevron}"`)
    expect(favicon).toContain(`d="${MARK.underscore}"`)
    expect(favicon).toContain(
      `stroke-width="${Math.round(MARK.stroke * COMPACT.stroke * 1000) / 1000}"`
    )
    expect(favicon).toContain(`scale(${COMPACT.glyph})`)
    expect(favicon).toContain(`rx="${MARK.radius}"`)
    expect(favicon).toContain(`viewBox="0 0 ${MARK.grid} ${MARK.grid}"`)
    expect(favicon).toContain("prefers-color-scheme: dark")
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

  it("keeps an affiliate code from the query in the head, on every page", async () => {
    const html = await render(Base, { props, path: "/fr/pricing/" })
    const script = html.indexOf("pupitre_ref=")

    expect(script).toBeGreaterThan(-1)
    expect(script).toBeLessThan(html.indexOf("<body"))
    expect(html).toContain('n="pupitre.studio"')
  })

  it("preloads its own two fonts and asks no third party for them", async () => {
    const html = await render(Base, { props })
    const preloads = [
      ...html.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g),
    ].map((match) => match[1])

    expect(preloads).toHaveLength(2)
    expect(preloads.some((href) => href.includes("bricolage-grotesque"))).toBe(
      true
    )
    expect(preloads.some((href) => href.includes("jetbrains-mono"))).toBe(true)
    for (const href of preloads) {
      expect(href.startsWith("/")).toBe(true)
    }
    expect(html).not.toContain("fonts.googleapis.com")
    expect(html).not.toContain("fonts.gstatic.com")
  })

  it("points the alternates and the language switch at a translation with its own slug", async () => {
    const html = await render(Base, {
      props: {
        ...props,
        translations: {
          en: "/blog/claude-code-on-a-vps/",
          fr: "/fr/blog/claude-code-sur-un-vps/",
        },
      },
      path: "/blog/claude-code-on-a-vps/",
    })

    expect(html).toContain(
      '<link rel="alternate" hreflang="fr" href="https://pupitre.studio/fr/blog/claude-code-sur-un-vps/">'
    )
    expect(html).toContain(
      '<a href="/fr/blog/claude-code-sur-un-vps/" hreflang="fr"'
    )
    expect(html).not.toContain('href="/fr/blog/claude-code-on-a-vps/"')
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
    expect(html).toContain(">Integrations</a>")
    expect(html).toContain("<footer")
    expect(html).toContain("</footer>")
    expect(html).toContain('href="/legal/terms/"')
    expect(html).toContain('href="/legal/privacy/"')
    expect(html).toContain(`© ${new Date().getFullYear()} ${copyrightHolder()}`)
    expect(html).not.toContain('role="status"')
    expect(html).toContain('<main id="main"')
  })
})
