import { PLAN_IDS } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import { LOCALES } from "../../lib/i18n"
import { pricingContent } from "./pricing"

const DELAY_RE = /\d+\s*(days?|jours?|weeks?|semaines?|months?|mois)/i

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

  it("takes the numbers from placeholders, never from the text", () => {
    for (const locale of LOCALES) {
      const content = pricingContent(locale)

      expect(placeholders(content.hero.lead)).toEqual(
        ["days", "months", "price"].sort()
      )
      expect(placeholders(content.meta.description)).toContain("price")
      expect(placeholders(content.billing.yearNote)).toEqual(["months"])
      expect(placeholders(content.plans.trial)).toEqual(["days"])
      expect(placeholders(content.plans.serversUpTo)).toEqual(["count"])
      expect(placeholders(content.catalog.available)).toEqual(["count"])
    }
  })

  it("describes every shared plan, with a button only for the available ones", () => {
    for (const locale of LOCALES) {
      const { items } = pricingContent(locale).plans

      expect(Object.keys(items).sort()).toEqual([...PLAN_IDS].sort())
      expect(items.solo.cta).toBeDefined()
      expect(items.team.cta).toBeDefined()
      expect(items.hosted.cta).toBeUndefined()
      for (const id of PLAN_IDS) {
        expect(items[id].includes.length, id).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it("says what stays and what goes when the subscription stops, without a deadline", () => {
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
