import { FREE_SERVERS } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import { homeContent } from "../content/site/home"
import { fill } from "../lib/i18n"
import { render } from "../test/render"
import FreeNote from "./FreeNote.astro"

const PRICE_RE = /\$\d/

describe("FreeNote", () => {
  it("says free up to the shared number of servers, and links to the pricing page", async () => {
    for (const [path, locale, prefix] of [
      ["/", "en", ""],
      ["/fr/", "fr", "/fr"],
    ] as const) {
      const html = await render(FreeNote, { path })
      const { pricing } = homeContent(locale)

      expect(html, locale).toContain(`>${pricing.figure}</p>`)
      expect(html, locale).toContain(
        fill(pricing.lead, { count: FREE_SERVERS })
      )
      expect(html.match(/<li[\s>]/g), locale).toHaveLength(pricing.lines.length)
      expect(html, locale).not.toContain("{count}")
      expect(html, locale).toContain(`href="${prefix}/pricing/"`)
    }
  })

  it("quotes no price", async () => {
    const html = await render(FreeNote, { path: "/" })

    expect(html).not.toMatch(PRICE_RE)
  })
})
