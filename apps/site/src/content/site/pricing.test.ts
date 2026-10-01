import { describe, expect, it } from "vitest"
import { LOCALES } from "../../lib/i18n"
import { pricingContent } from "./pricing"

const DELAY_RE = /\d+\s*(days?|jours?|weeks?|semaines?|months?|mois)/i
const TRIAL_RE =
  /\blaunch\b|\blancement\b|\{days\}|\{date\}|essai de|-day trial/i

function leaves(value: unknown, trail = "root"): [string, string][] {
  if (typeof value === "string") {
    return [[trail, value]]
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leaves(item, `${trail}[${index}]`))
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      leaves(item, `${trail}.${key}`)
    )
  }

  return []
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
}

describe("pricing content", () => {
  it("has the same shape and no empty string in both languages", () => {
    const [en, fr] = LOCALES.map((locale) => leaves(pricingContent(locale)))

    expect(fr.map(([path]) => path)).toEqual(en.map(([path]) => path))
    for (const [path, text] of [...en, ...fr]) {
      expect(text.trim(), path).not.toBe("")
    }
  })

  it("keeps every placeholder identical across languages", () => {
    const [en, fr] = LOCALES.map((locale) => leaves(pricingContent(locale)))

    for (const [index, [path, text]] of en.entries()) {
      expect(placeholders(fr[index][1]), path).toEqual(placeholders(text))
    }
  })

  it("takes the number of free servers from a placeholder, never from the text", () => {
    for (const locale of LOCALES) {
      const content = pricingContent(locale)

      expect(placeholders(content.hero.headline)).toEqual(["count"])
      expect(placeholders(content.hero.unit)).toEqual(["count"])
      expect(placeholders(content.meta.description)).toEqual(["count"])
      expect(placeholders(content.offer)).toEqual(["count"])
      expect(placeholders(content.beyond.lead)).toEqual(["count"])
      expect(placeholders(content.catalog.available)).toEqual(["count"])
    }
  })

  it("speaks of no trial and no launch", () => {
    for (const locale of LOCALES) {
      for (const [path, text] of leaves(pricingContent(locale))) {
        expect(text, `${locale} ${path}`).not.toMatch(TRIAL_RE)
      }
    }
  })

  it("says what may and may not be done with the source", () => {
    for (const locale of LOCALES) {
      const { source } = pricingContent(locale)

      expect(source.allowed.lines.length).toBeGreaterThanOrEqual(3)
      expect(source.forbidden.lines.length).toBeGreaterThanOrEqual(2)
    }
  })

  it("says what stays and what goes when Pupitre is removed, without a deadline", () => {
    for (const locale of LOCALES) {
      const { stop } = pricingContent(locale)

      expect(stop.keep.lines.length).toBeGreaterThanOrEqual(3)
      expect(stop.lose.lines.length).toBeGreaterThanOrEqual(3)
      for (const [path, text] of leaves(stop, "stop")) {
        expect(text, path).not.toMatch(DELAY_RE)
      }
    }
  })

  it("compares with doing it yourself in both directions", () => {
    for (const locale of LOCALES) {
      const { diy } = pricingContent(locale)

      expect(diy.replaces.lines.length).toBeGreaterThanOrEqual(4)
      expect(diy.keeps.lines.length).toBeGreaterThanOrEqual(2)
    }
  })
})
