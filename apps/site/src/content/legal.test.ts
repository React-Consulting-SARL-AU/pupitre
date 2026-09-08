import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { LEGAL_DOCUMENTS } from "@pupitre/shared/legal"
import { describe, expect, it } from "vitest"
import { LOCALES } from "../lib/i18n"

const ROOT = "src/content/legal"

function page(locale: string, slug: string): string {
  return path.join(ROOT, locale, `${slug}.mdx`)
}

function read(locale: string, slug: string): string {
  return readFileSync(page(locale, slug), "utf8")
}

describe("les pages légales", () => {
  it("existent dans les deux langues pour chaque document du contrat partagé", () => {
    for (const locale of LOCALES) {
      for (const document of LEGAL_DOCUMENTS) {
        expect(existsSync(page(locale, document.slug)), document.slug).toBe(
          true
        )
      }
    }
  })

  it("portent l'ordre et la date que le contrat partagé leur donne", () => {
    for (const locale of LOCALES) {
      for (const document of LEGAL_DOCUMENTS) {
        const content = read(locale, document.slug)

        expect(content, document.slug).toContain(`order: ${document.order}`)
        expect(content, document.slug).toContain(`updated: ${document.updated}`)
      }
    }
  })

  it("se déclarent brouillons tant que le contrat partagé les dit brouillons", () => {
    for (const locale of LOCALES) {
      for (const document of LEGAL_DOCUMENTS) {
        expect(read(locale, document.slug), document.slug).toContain(
          `draft: ${document.status === "draft"}`
        )
      }
    }
  })

  it("ne revendiquent aucune forme juridique qui n'existe pas", () => {
    for (const locale of LOCALES) {
      for (const document of LEGAL_DOCUMENTS) {
        const content = read(locale, document.slug)

        expect(content, document.slug).not.toContain("LLC")
        expect(content, document.slug).not.toContain("Inc.")
      }
    }
  })

  it("nomment les sous-traitants par le contrat partagé, jamais à la main", () => {
    for (const locale of LOCALES) {
      for (const slug of ["privacy", "data-processing"]) {
        expect(read(locale, slug), slug).toContain("<SubProcessors />")
      }
    }
  })
})
