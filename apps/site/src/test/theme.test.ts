import { DARK, LIGHT } from "@pupitre/design/tokens"
import { describe, expect, it } from "vitest"
import { THEME_COOKIE } from "../lib/theme"
import FrHome from "../pages/fr/index.astro"
import FrPricing from "../pages/fr/pricing.astro"
import Home from "../pages/index.astro"
import Pricing from "../pages/pricing.astro"
import { render } from "./render"

const SCRIPT_RE = /<script[^>]*>([\s\S]*?)<\/script>/g

const PAGES = [
  [Home, "/"],
  [Pricing, "/pricing/"],
  [FrHome, "/fr/"],
  [FrPricing, "/fr/pricing/"],
] as const

function bootScript(html: string): string {
  const script = [...html.matchAll(SCRIPT_RE)]
    .map((match) => match[1])
    .find((body) => body.includes(THEME_COOKIE))

  return script ?? ""
}

function rootAfterBoot(html: string, cookie: string): Record<string, string> {
  const dataset: Record<string, string> = {}

  new Function("document", bootScript(html))({
    cookie,
    documentElement: { dataset },
  })

  return dataset
}

describe("both themes", () => {
  it("paints from the same token names, none of them shared", () => {
    expect(Object.keys(DARK)).toEqual(Object.keys(LIGHT))

    for (const key of Object.keys(LIGHT) as (keyof typeof LIGHT)[]) {
      expect(DARK[key], key).not.toBe(LIGHT[key])
    }

    expect(DARK.base).toBe(LIGHT.ink)
    expect(DARK.ink).not.toBe(LIGHT.ink)
  })

  it("puts the dark page one attribute away, before the first paint", async () => {
    for (const [page, path] of PAGES) {
      const html = await render(page, { path })

      expect(bootScript(html), path).not.toBe("")
      expect(html.indexOf(bootScript(html)), path).toBeLessThan(
        html.indexOf("<body")
      )
      expect(rootAfterBoot(html, `${THEME_COOKIE}=dark`), path).toEqual({
        theme: "dark",
      })
      expect(rootAfterBoot(html, `${THEME_COOKIE}=light`), path).toEqual({
        theme: "light",
      })
      expect(rootAfterBoot(html, ""), path).toEqual({})
    }
  })

  it("leaves an unchosen theme to the system, and says so to the browser", async () => {
    for (const [page, path] of PAGES) {
      const html = await render(page, { path })

      expect(html, path).toContain(
        '<meta name="color-scheme" content="light dark">'
      )
      expect(html, path).toContain('media="(prefers-color-scheme: light)"')
      expect(html, path).toContain('media="(prefers-color-scheme: dark)"')
      expect(html, path).toContain('data-theme-option="dark"')
    }
  })
})
