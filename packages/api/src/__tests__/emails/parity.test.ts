import { describe, expect, it } from "bun:test"
import { EMAIL_PREVIEWS } from "../../emails/catalog"
import { EMAIL_EN, EMAIL_FR } from "../../emails/i18n"
import { EMAIL_TEMPLATE_IDS } from "../../emails/templates/ids"

const PLACEHOLDER_RE = /\{(\w+)\}/g

function placeholdersOf(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_RE)].map((match) => match[1]).sort()
}

describe("parité des dictionnaires", () => {
  it("le français et l'anglais portent exactement les mêmes clés", () => {
    expect(Object.keys(EMAIL_EN).sort()).toEqual(Object.keys(EMAIL_FR).sort())
  })

  it("chaque gabarit a son bloc de clés dans les deux langues", () => {
    for (const id of EMAIL_TEMPLATE_IDS) {
      const french = Object.keys(EMAIL_FR).filter((key) =>
        key.startsWith(`${id}.`)
      )
      const english = Object.keys(EMAIL_EN).filter((key) =>
        key.startsWith(`${id}.`)
      )

      expect(french.length).toBeGreaterThan(0)
      expect(english.sort()).toEqual(french.sort())
    }
  })

  it("une clé porte les mêmes paramètres dans les deux langues", () => {
    for (const [key, french] of Object.entries(EMAIL_FR)) {
      expect(placeholdersOf(EMAIL_EN[key as keyof typeof EMAIL_FR])).toEqual(
        placeholdersOf(french)
      )
    }
  })

  it("aucune traduction n'est vide", () => {
    for (const value of [
      ...Object.values(EMAIL_FR),
      ...Object.values(EMAIL_EN),
    ]) {
      expect(value.trim().length).toBeGreaterThan(0)
    }
  })
})

describe("parité des rendus", () => {
  it("les deux langues rendent le même gabarit avec les mêmes liens", async () => {
    for (const preview of EMAIL_PREVIEWS) {
      const [french, english] = await Promise.all([
        preview.render("fr"),
        preview.render("en"),
      ])

      expect(hrefsOf(english.html)).toEqual(hrefsOf(french.html))
      expect(english.subject).not.toBe(french.subject)
    }
  })
})

const HREF_RE = /href="([^"]+)"/g

function hrefsOf(html: string): string[] {
  return [...html.matchAll(HREF_RE)].map((match) => match[1]).sort()
}
