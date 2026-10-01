import { describe, expect, it } from "vitest"
import { LOCALES } from "../../lib/i18n"
import { homeContent } from "./home"

/** The two places allowed to name a VPS: the answer that defines it, and search. */
const DEFINES_IT = /^root\.(faq|meta)/

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

  it("ends the headline on the word that cools, so the hero can frost it", () => {
    for (const locale of LOCALES) {
      const { headline, cooled } = homeContent(locale).hero

      expect(headline, locale).toMatch(new RegExp(` ${cooled}\\.$`))
    }
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

  it("holds three features of two lines, three clients, four claims, seven questions, six steps", () => {
    for (const locale of LOCALES) {
      const content = homeContent(locale)

      expect(content.features.items).toHaveLength(3)
      for (const feature of content.features.items) {
        expect(feature.lines).toHaveLength(2)
      }
      expect(content.clients.items).toHaveLength(3)
      for (const client of content.clients.items) {
        expect(client.lines).toHaveLength(2)
      }
      expect(content.promise.items).toHaveLength(4)
      expect(content.faq.items).toHaveLength(7)
      expect(content.steps.items).toHaveLength(6)
    }
  })

  it("keeps the jargon off the page, and defines the one word search needs", () => {
    const JARGON = ["SSH", "ed25519", "ufw", "fail2ban", "tmux", "systemd"]

    for (const locale of LOCALES) {
      const content = homeContent(locale)
      const spoken = leaves(content)
        .filter(([path]) => !DEFINES_IT.test(path))
        .map(([, text]) => text)
        .join(" ")

      for (const word of [...JARGON, "VPS"]) {
        expect(spoken, `${locale} ${word}`).not.toContain(word)
      }

      const faq = content.faq.items.map((item) => item.answer).join(" ")

      expect(content.meta.description, locale).toContain("VPS")
      expect(faq, locale).toContain("VPS")
      for (const word of JARGON) {
        expect(faq, `${locale} ${word}`).not.toContain(word)
      }
    }
  })

  it("keeps every placeholder identical across languages, and names only the free servers", () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    const [en, fr] = LOCALES.map((locale) => leaves(homeContent(locale)))

    for (const [index, [path, text]] of en.entries()) {
      expect(placeholders(fr[index][1]), path).toEqual(placeholders(text))
      for (const name of placeholders(text)) {
        expect(name, path).toBe("count")
      }
    }
    expect(placeholders(homeContent("en").pricing.title)).toEqual(["count"])
  })
})
