import { describe, expect, it } from "vitest"
import { render } from "../test/render"
import LocaleSwitch from "./LocaleSwitch.astro"

describe("LocaleSwitch", () => {
  it("links to the same page in French from an English page", async () => {
    const html = await render(LocaleSwitch, { path: "/pricing/" })

    expect(html).toContain(
      '<a href="/fr/pricing/" hreflang="fr" lang="fr" aria-label="Français"'
    )
    expect(html).toContain(">FR</a>")
  })

  it("links to the translation a page names, whatever its slug", async () => {
    const html = await render(LocaleSwitch, {
      path: "/blog/claude-code-on-a-vps/",
      props: { href: "/fr/blog/claude-code-sur-un-vps/" },
    })

    expect(html).toContain(
      '<a href="/fr/blog/claude-code-sur-un-vps/" hreflang="fr"'
    )
  })

  it("links back to English from a French page", async () => {
    const html = await render(LocaleSwitch, { path: "/fr/pricing/" })

    expect(html).toContain(
      '<a href="/pricing/" hreflang="en" lang="en" aria-label="English"'
    )
    expect(html).toContain(">EN</a>")
  })
})
