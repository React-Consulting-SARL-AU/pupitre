import { describe, expect, it } from "vitest"
import { en } from "../content/ui/en"
import { fr } from "../content/ui/fr"
import {
  alternateLocale,
  DEFAULT_LOCALE,
  fill,
  LOCALES,
  localeFromPath,
  localizePath,
  stripLocale,
  translator,
} from "./i18n"

describe("locales", () => {
  it("serves English by default and French under /fr", () => {
    expect(LOCALES).toEqual(["en", "fr"])
    expect(DEFAULT_LOCALE).toBe("en")
  })

  it("reads the locale from the first path segment", () => {
    expect(localeFromPath("/")).toBe("en")
    expect(localeFromPath("/pricing/")).toBe("en")
    expect(localeFromPath("/fr")).toBe("fr")
    expect(localeFromPath("/fr/")).toBe("fr")
    expect(localeFromPath("/fr/pricing/")).toBe("fr")
    expect(localeFromPath("/french/")).toBe("en")
  })

  it("strips the locale prefix and keeps the rest of the path", () => {
    expect(stripLocale("/")).toBe("/")
    expect(stripLocale("/fr")).toBe("/")
    expect(stripLocale("/fr/")).toBe("/")
    expect(stripLocale("/fr/pricing/")).toBe("/pricing/")
    expect(stripLocale("/pricing/")).toBe("/pricing/")
  })

  it("localizes a path for a locale, whatever prefix it already has", () => {
    expect(localizePath("/", "en")).toBe("/")
    expect(localizePath("/", "fr")).toBe("/fr/")
    expect(localizePath("/pricing/", "fr")).toBe("/fr/pricing/")
    expect(localizePath("/fr/pricing/", "en")).toBe("/pricing/")
    expect(localizePath("/fr/pricing/", "fr")).toBe("/fr/pricing/")
  })

  it("names the other locale", () => {
    expect(alternateLocale("en")).toBe("fr")
    expect(alternateLocale("fr")).toBe("en")
  })
})

describe("dictionary", () => {
  it("has the same keys in both languages", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort())
  })

  it("leaves no empty string", () => {
    for (const dictionary of [en, fr]) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim(), key).not.toBe("")
      }
    }
  })

  it("translates a key for a locale", () => {
    expect(translator("en")("nav.docs")).toBe("Docs")
    expect(translator("fr")("nav.pricing")).toBe("Tarifs")
  })
})

describe("fill", () => {
  it("replaces every placeholder with its value", () => {
    expect(fill("{price} € per {unit}", { price: 19, unit: "server" })).toBe(
      "19 € per server"
    )
    expect(fill("{n} and {n}", { n: 2 })).toBe("2 and 2")
  })

  it("throws on a placeholder without a value", () => {
    expect(() => fill("{price} €", {})).toThrow('Missing value for "price"')
  })
})
