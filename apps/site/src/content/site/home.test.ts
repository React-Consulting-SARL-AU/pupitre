import { describe, expect, it } from "vitest"
import { LOCALES } from "../../lib/i18n"
import { homeContent } from "./home"

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

describe("home content", () => {
  it("carries the PRODUCT.md sentence in French and a crafted English one", () => {
    expect(homeContent("fr").hero.headline).toBe(
      "Vos agents IA travaillent sur une machine à eux. Votre laptop respire."
    )
    expect(homeContent("en").hero.headline).toBe(
      "Your AI agents get a machine of their own. Your laptop cools down."
    )
  })

  it("has the same shape and no empty string in both languages", () => {
    const [en, fr] = LOCALES.map((locale) => leaves(homeContent(locale)))

    expect(fr.map(([path]) => path)).toEqual(en.map(([path]) => path))
    for (const [path, text] of [...en, ...fr]) {
      expect(text.trim(), path).not.toBe("")
    }
  })

  it("says the product in a two-sentence lead", () => {
    for (const locale of LOCALES) {
      const sentences = homeContent(locale).hero.lead.match(/[.!?](\s|$)/g)

      expect(sentences, locale).toHaveLength(2)
    }
  })

  it("holds three features of three lines, three claims, five questions", () => {
    for (const locale of LOCALES) {
      const content = homeContent(locale)

      expect(content.features.items).toHaveLength(3)
      for (const feature of content.features.items) {
        expect(feature.lines).toHaveLength(3)
      }
      expect(content.promise.items).toHaveLength(3)
      expect(content.faq.items).toHaveLength(5)
    }
  })

  it("keeps the placeholders of the pricing note identical across languages", () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    const [en, fr] = LOCALES.map((locale) => homeContent(locale).pricing)

    expect(placeholders(fr.perServer)).toEqual(placeholders(en.perServer))
    expect(placeholders(fr.annual)).toEqual(placeholders(en.annual))
    expect(placeholders(fr.trial)).toEqual(placeholders(en.trial))
    expect(placeholders(fr.hosted)).toEqual(placeholders(en.hosted))
    expect(placeholders(en.perServer)).toContain("price")
  })
})
