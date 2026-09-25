import { describe, expect, it } from "bun:test"
import { browserLocale, localeFromHeader } from "./locale"

describe("la langue du navigateur", () => {
  it("suit le choix gardé dans le cookie", () => {
    expect(browserLocale("pupitre_locale=en", ["fr-FR"])).toBe("en")
  })

  it("sans choix, parle la langue que le rendu serveur a tirée de l'Accept-Language", () => {
    const languages = ["fr-FR", "en-US"]

    expect(browserLocale("", languages)).toBe(
      localeFromHeader(languages.join(","))
    )
    expect(browserLocale("", languages)).toBe("fr")
  })
})
